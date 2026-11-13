import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Account } from '@prisma/client';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PlanningModule } from '../src/planning/planning.module.js';
import { AccountsModule } from '../src/accounts/accounts.module.js';
import { TransactionsModule } from '../src/transactions/transactions.module.js';
import { dateKey, today, utcDate } from '../src/common/dates.js';

describe.runIf(process.env.RUN_PLANNING_DB_TESTS === 'true')('Tarjetas y proyección: API y PostgreSQL', () => {
  let app: INestApplication, prisma: PrismaService;
  let bank: Account, card: Account, cash: Account, foreign: Account;
  let token: string;
  const owner = randomUUID(), other = randomUUID();
  const start = today();
  const day = (offset = 0) => dateKey(utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + offset));
  const headers = () => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());
  const profile = () => ({ creditLimit: 1000, closingDay: 15, paymentDay: 5, paymentAccountId: bank.id });
  const statementData = () => ({ cardAccountId: card.id, closingDate: day(-5), dueDate: day(5), total: 400, minimumPayment: 100 });
  const configure = () => api().put('/api/planning/cards/' + card.id).set(headers()).send(profile());
  const createStatement = (data: object = {}) => api().post('/api/planning/statements').set(headers()).send({ ...statementData(), ...data });
  const pay = (id: string, data: object = {}) => api().post('/api/planning/statements/' + id + '/pay').set(headers()).send({ fromAccountId: bank.id, amount: 100, date: day(), requestId: randomUUID(), ...data });
  const projection = (data: object = {}) => api().get('/api/planning/projection').set(headers()).query({ accountId: bank.id, days: 30, ...data });
  const recurring = () => prisma.recurringPayment.create({ data: { userId: owner, accountId: bank.id, name: 'Servicio mensual', amount: 50, dueDay: start.getUTCDate() } });
  const record = (id: string, data: object = {}) => api().post('/api/planning/recurring/' + id + '/record').set(headers()).send({ dueDate: day(), date: day(), amount: 50, ...data });
  beforeAll(async () => {
    if (!['localhost', '127.0.0.1', 'postgres'].includes(new URL(process.env.DATABASE_URL ?? '').hostname)) throw new Error('Solo se permite PostgreSQL local en estas pruebas.');
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, PlanningModule, AccountsModule, TransactionsModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    await prisma.user.createMany({ data: [owner, other].map(id => ({ id, email: `${id}@planning.test`, name: 'Planning test', passwordHash: 'unused' })) });
    foreign = await prisma.account.create({ data: { userId: other, name: 'Ajena', type: 'CREDIT_CARD' } });
    token = app.get(JwtService).sign({ sub: owner });
  });
  beforeEach(async () => {
    await prisma.transfer.deleteMany({ where: { userId: owner } });
    await prisma.account.deleteMany({ where: { userId: owner } });
    bank = await prisma.account.create({ data: { userId: owner, name: 'Banco', type: 'BANK', initialBalance: 1000 } });
    cash = await prisma.account.create({ data: { userId: owner, name: 'Efectivo', type: 'CASH' } });
    card = await prisma.account.create({ data: { userId: owner, name: 'Tarjeta', type: 'CREDIT_CARD', initialBalance: -400 } });
  });
  afterAll(async () => { try { if (prisma) await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } }); } finally { if (app) await app.close(); } });

  it('exige JWT, aísla usuarios y valida el tipo y la moneda de la cuenta de pago', async () => {
    await api().get('/api/planning/cards').expect(401);
    await api().put('/api/planning/cards/' + foreign.id).set(headers()).send(profile()).expect(404);
    await api().put('/api/planning/cards/' + bank.id).set(headers()).send(profile()).expect(404);
    for (const paymentAccountId of [foreign.id, card.id]) await api().put('/api/planning/cards/' + card.id).set(headers()).send({ ...profile(), paymentAccountId }).expect(400);
    await prisma.account.update({ where: { id: cash.id }, data: { currency: 'USD' } });
    await api().put('/api/planning/cards/' + card.id).set(headers()).send({ ...profile(), paymentAccountId: cash.id }).expect(400);
    await projection({ accountId: foreign.id }).expect(404);
    await createStatement({ cardAccountId: foreign.id }).expect(404);
  });

  it('muestra deuda y cupo a hoy sin incluir movimientos futuros', async () => {
    await configure().expect(200);
    await prisma.transaction.createMany({ data: [
      { userId: owner, accountId: card.id, type: 'EXPENSE', amount: 100, date: new Date(day()), currency: 'COP' },
      { userId: owner, accountId: card.id, type: 'EXPENSE', amount: 800, date: new Date(day(1)), currency: 'COP' },
    ] });
    const cards = (await api().get('/api/planning/cards').set(headers()).expect(200)).body;
    expect(cards).toHaveLength(1); expect(cards[0]).toMatchObject({ debt: 500, balance: -500, availableCredit: 500, utilization: 50 });
    const forecast = (await projection({ accountId: card.id }).expect(200)).body;
    expect(forecast.openingBalance).toBe(-500); expect(forecast.closingBalance).toBe(-1300); expect(forecast.firstOverLimitDate).toBe(day(1));
  });

  it('crea y edita extractos, evita cortes duplicados y protege importes y fechas', async () => {
    const statement = (await createStatement().expect(201)).body;
    await createStatement().expect(409);
    await createStatement({ closingDate: day(1) }).expect(400);
    await createStatement({ closingDate: day(-6), dueDate: day(-7) }).expect(400);
    await createStatement({ closingDate: day(-6), total: 99, minimumPayment: 100 }).expect(400);
    await api().put('/api/planning/statements/' + statement.id).set(headers()).send({ ...statementData(), total: 450, plannedPaymentDate: day(3) }).expect(200);
    await api().delete('/api/planning/statements/' + statement.id).set(headers()).expect(204);
    expect(await prisma.cardStatement.count({ where: { cardAccountId: card.id } })).toBe(0);
  });

  it('registra pagos atómicos como transferencias, mantiene saldos y permite reintentar sin duplicar', async () => {
    await configure().expect(200);
    const statement = (await createStatement().expect(201)).body;
    const requestId = randomUUID();
    const first = await pay(statement.id, { requestId }).expect(201);
    expect((await pay(statement.id, { requestId }).expect(201)).body.id).toBe(first.body.id);
    await pay(statement.id, { requestId, amount: 200 }).expect(409);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(2);
    const balances = (await api().get('/api/accounts').set(headers()).expect(200)).body;
    expect(balances.find((a: Account) => a.id === bank.id).balance).toBe(900);
    expect(balances.find((a: Account) => a.id === card.id).balance).toBe(-300);
    expect((await api().get('/api/transactions/summary').set(headers()).expect(200)).body.totalExpense).toBe(0);
    expect((await projection().expect(200)).body.closingBalance).toBe(600);
    await api().delete('/api/planning/statements/' + statement.id).set(headers()).expect(409);
    await api().delete('/api/transfers/' + first.body.id).set(headers()).expect(204);
    expect((await projection().expect(200)).body).toMatchObject({ openingBalance: 1000, closingBalance: 600 });
  });

  it('impide sobrepagos incluso con dos solicitudes concurrentes', async () => {
    const statement = (await createStatement().expect(201)).body;
    const results = await Promise.all([pay(statement.id, { amount: 300 }), pay(statement.id, { amount: 300 })]);
    expect(results.map(r => r.status).sort()).toEqual([201, 400]);
    expect(Number((await prisma.transfer.aggregate({ where: { cardStatementId: statement.id }, _sum: { amount: true } }))._sum.amount)).toBe(300);
    await pay(statement.id, { amount: 101 }).expect(400);
    await api().put('/api/planning/statements/' + statement.id).set(headers()).send({ ...statementData(), total: 200 }).expect(400);
  });

  it('protege extractos ajenos y pagos con tarjeta, otra moneda o fecha anterior al corte', async () => {
    const statement = (await createStatement().expect(201)).body;
    await pay(statement.id, { fromAccountId: foreign.id }).expect(404);
    const another = await prisma.account.create({ data: { userId: owner, name: 'Otra tarjeta', type: 'CREDIT_CARD' } });
    await pay(statement.id, { fromAccountId: another.id }).expect(400);
    await prisma.account.update({ where: { id: cash.id }, data: { currency: 'USD' } });
    await pay(statement.id, { fromAccountId: cash.id }).expect(400);
    await pay(statement.id, { date: day(-6) }).expect(400);
    const hidden = await prisma.cardStatement.create({ data: { cardAccountId: foreign.id, closingDate: new Date(day(-5)), dueDate: new Date(day(5)), total: 100, minimumPayment: 10 } });
    await pay(hidden.id).expect(404);
    await api().delete('/api/planning/statements/' + hidden.id).set(headers()).expect(404);
    expect(await prisma.transfer.count({ where: { userId: owner } })).toBe(0);
  });

  it('descuenta pagos futuros de la estimación y los incorpora una sola vez en ambas cuentas', async () => {
    await configure().expect(200);
    const statement = (await createStatement().expect(201)).body;
    await pay(statement.id, { date: day(3), amount: 150 }).expect(201);
    const forecast = (await projection().expect(200)).body;
    expect(forecast).toMatchObject({ openingBalance: 1000, closingBalance: 600, totalOutflows: 400 });
    expect(forecast.events.map((e: { amount: number }) => e.amount)).toEqual([-150, -250]);
    expect((await projection({ accountId: card.id }).expect(200)).body).toMatchObject({ openingBalance: -400, closingBalance: 0, totalInflows: 400 });
    const cards = (await api().get('/api/planning/cards').set(headers()).expect(200)).body;
    expect(cards[0].statements[0]).toMatchObject({ paid: 0, scheduled: 150, remaining: 400, unplanned: 250 });
  });

  it('incorpora movimientos futuros el día correcto y detecta déficit de saldo', async () => {
    await prisma.transaction.createMany({ data: [
      { userId: owner, accountId: bank.id, type: 'EXPENSE', amount: 1200, date: new Date(day(1)), currency: 'COP' },
      { userId: owner, accountId: bank.id, type: 'INCOME', amount: 500, date: new Date(day(2)), currency: 'COP' },
      { userId: owner, accountId: cash.id, type: 'INCOME', amount: 9000, date: new Date(day(1)), currency: 'COP' },
    ] });
    const forecast = (await projection().expect(200)).body;
    expect(forecast).toMatchObject({ openingBalance: 1000, closingBalance: 300, minimumBalance: -200, firstNegativeDate: day(1) });
    expect(forecast.points[1]).toEqual({ date: day(1), balance: -200 });
    expect(forecast.events).toHaveLength(2);
  });

  it('reemplaza el recurrente previsto por el importe real y protege su vencimiento mensual', async () => {
    const payment = await recurring();
    const before = (await projection().expect(200)).body;
    expect(before.events.some((e: { kind: string; date: string }) => e.kind === 'RECURRING' && e.date === day())).toBe(true);
    const first = await record(payment.id, { amount: 45 }).expect(201);
    expect((await record(payment.id, { amount: 45 }).expect(201)).body.id).toBe(first.body.id);
    await record(payment.id, { amount: 46 }).expect(409);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(1);
    const after = (await projection().expect(200)).body;
    expect(after.openingBalance).toBe(955);
    expect(after.events.some((e: { kind: string; date: string }) => e.kind === 'RECURRING' && e.date === day())).toBe(false);
    await api().patch('/api/transactions/' + first.body.id).set(headers()).send({ amount: 10 }).expect(400);
    await prisma.recurringPayment.update({ where: { id: payment.id }, data: { dueDay: 31 } });
    const changed = (await projection().expect(200)).body;
    expect(changed.events.some((e: { kind: string; date: string }) => e.kind === 'RECURRING' && e.date.slice(0, 7) === day().slice(0, 7))).toBe(false);
    expect((await record(payment.id, { amount: 45 }).expect(201)).body.id).toBe(first.body.id);
    await api().delete('/api/transactions/' + first.body.id).set(headers()).expect(200);
  });

  it('no duplica un recurrente registrado con fecha futura, incluso con envíos simultáneos', async () => {
    const payment = await recurring();
    const results = await Promise.all([record(payment.id, { date: day(2) }).expect(201), record(payment.id, { date: day(2) }).expect(201)]);
    expect(results[0].body.id).toBe(results[1].body.id);
    const forecast = (await projection().expect(200)).body;
    expect(forecast.openingBalance).toBe(1000);
    expect(forecast.events.filter((e: { id: string }) => e.id === results[0].body.id)).toHaveLength(1);
    expect(forecast.events.some((e: { kind: string; date: string }) => e.kind === 'RECURRING' && e.date === day())).toBe(false);
  });

  it('permite escenarios de pago mínimo y excluir recurrentes sin escribir datos', async () => {
    await configure().expect(200); await createStatement().expect(201); await recurring();
    const full = (await projection({ includeRecurring: false }).expect(200)).body;
    const minimum = (await projection({ includeRecurring: false, paymentMode: 'MINIMUM' }).expect(200)).body;
    expect(full.closingBalance).toBe(600); expect(minimum.closingBalance).toBe(900);
    expect(minimum.events).toHaveLength(1); expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
  });

  it('sitúa extractos vencidos hoy y respeta una fecha de pago prevista explícita', async () => {
    await configure().expect(200);
    await createStatement({ dueDate: day(-1) }).expect(201);
    const overdue = (await projection().expect(200)).body;
    expect(overdue.events[0].date).toBe(day());
    const cards = (await api().get('/api/planning/cards').set(headers()).expect(200)).body;
    expect(cards[0].statements[0].overdue).toBe(true);
    await api().put('/api/planning/statements/' + cards[0].statements[0].id).set(headers()).send({ ...statementData(), plannedPaymentDate: day(10) }).expect(200);
    expect((await projection().expect(200)).body.events[0].date).toBe(day(10));
  });

  it('valida horizontes, días, importes, fechas y protege tipo y moneda configurados', async () => {
    for (const change of [{ creditLimit: 0 }, { closingDay: 0 }, { paymentDay: 32 }, { closingDay: 1.5 }]) await api().put('/api/planning/cards/' + card.id).set(headers()).send({ ...profile(), ...change }).expect(400);
    for (const query of [{ days: 31 }, { days: 1000 }, { paymentMode: 'OTHER' }, { includeRecurring: 'yes' }]) await projection(query).expect(400);
    await createStatement({ closingDate: '2026-02-30' }).expect(400);
    await configure().expect(200);
    await api().patch('/api/accounts/' + card.id).set(headers()).send({ type: 'BANK' }).expect(400);
    await api().patch('/api/accounts/' + bank.id).set(headers()).send({ currency: 'USD' }).expect(400);
    const payment = await recurring();
    await record(payment.id, { dueDate: '2026-02-30' }).expect(400);
    await prisma.account.update({ where: { id: bank.id }, data: { archived: true } });
    await projection().expect(404);
    await record(payment.id).expect(400);
  });

  it('revierte el pago completo si falla una de las dos escrituras del libro', async () => {
    const statement = (await createStatement().expect(201)).body;
    const suffix = owner.replaceAll('-', ''), fn = `reject_card_${suffix}`, trigger = `reject_card_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${owner}' AND NEW."accountId" = '${card.id}' THEN RAISE EXCEPTION 'simulated payment failure'; END IF; RETURN NEW; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
      await pay(statement.id).expect(500);
      expect(await prisma.transfer.count({ where: { userId: owner } })).toBe(0);
      expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Transaction"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });

  it('proyecta solo el último extracto para evitar duplicar saldos arrastrados', async () => {
    await configure().expect(200);
    const older = (await createStatement({ closingDate: day(-35), dueDate: day(-5), total: 200 }).expect(201)).body;
    await pay(older.id, { amount: 50, date: day(-3) }).expect(201);
    const latest = (await createStatement().expect(201)).body;
    const forecast = (await projection().expect(200)).body;
    expect(forecast).toMatchObject({ openingBalance: 950, totalOutflows: 350, closingBalance: 600 });
    expect(forecast.events).toHaveLength(1); expect(forecast.events[0].statementId).toBe(latest.id);
    await pay(older.id, { amount: 10 }).expect(400);
    const cards = (await api().get('/api/planning/cards').set(headers()).expect(200)).body;
    expect(cards[0].statements[0]).toMatchObject({ isLatest: true, paid: 50, remaining: 350 });
    expect(cards[0].statements[1].isLatest).toBe(false);
  });

  it('descuenta transferencias de pago posteriores al corte aunque se registren desde Transferencias', async () => {
    await configure().expect(200);
    const statement = (await createStatement().expect(201)).body;
    await api().post('/api/transfers').set(headers()).send({ fromAccountId: bank.id, toAccountId: card.id, amount: 150, date: day(2), requestId: randomUUID() }).expect(201);
    const forecast = (await projection().expect(200)).body;
    expect(forecast).toMatchObject({ openingBalance: 1000, totalOutflows: 400, closingBalance: 600 });
    expect(forecast.events.map((e: { amount: number }) => e.amount)).toEqual([-150, -250]);
    await pay(statement.id, { amount: 251 }).expect(400);
  });

  it('admite un extracto nuevo en cero y retira del plan el saldo anterior', async () => {
    await configure().expect(200);
    await createStatement({ closingDate: day(-35), dueDate: day(-5) }).expect(201);
    await createStatement({ total: 0, minimumPayment: 0 }).expect(201);
    const forecast = (await projection().expect(200)).body;
    expect(forecast.events).toHaveLength(0); expect(forecast.closingBalance).toBe(1000);
  });

  it('mantiene el reintento idempotente si se corrige la fecha de corte después del pago', async () => {
    const statement = (await createStatement().expect(201)).body;
    const requestId = randomUUID();
    const first = await pay(statement.id, { requestId }).expect(201);
    await api().put('/api/planning/statements/' + statement.id).set(headers()).send({ ...statementData(), closingDate: day(-6) }).expect(200);
    expect((await pay(statement.id, { requestId }).expect(201)).body.id).toBe(first.body.id);
    expect(await prisma.transfer.count({ where: { userId: owner } })).toBe(1);
  });
});
