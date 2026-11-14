import { testToken } from './auth-session.js';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Account } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const runDatabaseTests = process.env.RUN_TRANSFER_DB_TESTS === 'true';

describe.runIf(runDatabaseTests)('Transferencias: API y PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accounts: Account[];
  let token: string;
  let otherToken: string;
  const owner = randomUUID();
  const otherUser = randomUUID();
  const headers = () => ({ Authorization: `Bearer ${token}` });
  const payload = () => ({ fromAccountId: accounts[0].id, toAccountId: accounts[1].id,
    amount: 100, date: '2026-11-12', requestId: randomUUID() });

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? '').hostname;
    if (!['localhost', '127.0.0.1', 'postgres'].includes(hostname)) {
      throw new Error('Estas pruebas requieren PostgreSQL local de prueba, nunca la base remota.');
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.createMany({ data: [owner, otherUser].map(id => ({ id, email: `${id}@test.local`, passwordHash: 'unused-test-hash', name: 'Transfer test' })) });
    const jwt = app.get(JwtService);
    token = await testToken(prisma, jwt, owner);
    otherToken = await testToken(prisma, jwt, otherUser);
  });

  beforeEach(async () => {
    await prisma.transfer.deleteMany({ where: { userId: owner } });
    await prisma.account.deleteMany({ where: { userId: owner } });
    accounts = await Promise.all([
      prisma.account.create({ data: { userId: owner, name: 'Banco', type: 'BANK', initialBalance: 1000, currency: 'COP' } }),
      prisma.account.create({ data: { userId: owner, name: 'Efectivo', type: 'CASH', initialBalance: 0, currency: 'COP' } }),
      prisma.account.create({ data: { userId: owner, name: 'Dólares', type: 'BANK', initialBalance: 0, currency: 'USD' } }),
    ]);
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: [owner, otherUser] } } });
    if (app) await app.close();
  });

  it('requiere autenticación', async () => {
    await request(app.getHttpServer()).post('/api/transfers').send(payload()).expect(401);
  });

  it('registra salida y entrada, cambia saldos y no cambia los totales', async () => {
    const result = await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(payload()).expect(201);
    const legs = await prisma.transaction.findMany({ where: { transferId: result.body.id }, orderBy: { type: 'asc' } });
    expect(legs).toHaveLength(2);
    expect(legs.map(t => t.type).sort()).toEqual(['EXPENSE', 'INCOME']);
    const balances = await request(app.getHttpServer()).get('/api/accounts').set(headers()).expect(200);
    expect(balances.body.find((a: Account) => a.id === accounts[0].id).balance).toBe(900);
    expect(balances.body.find((a: Account) => a.id === accounts[1].id).balance).toBe(100);
    const summary = await request(app.getHttpServer()).get('/api/transactions/summary').set(headers()).expect(200);
    expect(summary.body).toMatchObject({ totalIncome: 0, totalExpense: 0, byCategory: [], byMonth: [] });
    const history = await request(app.getHttpServer()).get(`/api/accounts/${accounts[0].id}/balance-history`).set(headers()).expect(200);
    expect(history.body).toEqual([{ month: '2026-11', balance: 900 }]);
  });

  it('el mismo envío reintentado no duplica el movimiento y no admite reutilizar la clave con otros datos', async () => {
    const dto = payload();
    const first = await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(dto).expect(201);
    const repeated = await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(dto).expect(201);
    expect(repeated.body.id).toBe(first.body.id);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(2);
    await request(app.getHttpServer()).post('/api/transfers').set(headers()).send({ ...dto, amount: 200 }).expect(409);
  });

  it('pagar una tarjeta reduce su deuda sin volver a contabilizar el gasto', async () => {
    const card = await prisma.account.create({ data: { userId: owner, name: 'Tarjeta', type: 'CREDIT_CARD', currency: 'COP', initialBalance: -500 } });
    await request(app.getHttpServer()).post('/api/transfers').set(headers()).send({ ...payload(), toAccountId: card.id }).expect(201);
    const balances = await request(app.getHttpServer()).get('/api/accounts').set(headers()).expect(200);
    expect(balances.body.find((a: Account) => a.id === card.id).balance).toBe(-400);
    const summary = await request(app.getHttpServer()).get('/api/transactions/summary').set(headers()).expect(200);
    expect(summary.body).toMatchObject({ totalIncome: 0, totalExpense: 0 });
  });

  it('conserva ingresos y gastos ordinarios al añadir una transferencia', async () => {
    await prisma.transaction.createMany({ data: [
      { userId: owner, accountId: accounts[0].id, type: 'INCOME', amount: 30, currency: 'COP', date: new Date('2026-11-12') },
      { userId: owner, accountId: accounts[0].id, type: 'EXPENSE', amount: 20, currency: 'COP', date: new Date('2026-11-12') },
    ] });
    await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(payload()).expect(201);
    const summary = await request(app.getHttpServer()).get('/api/transactions/summary').set(headers()).expect(200);
    expect(summary.body).toMatchObject({ totalIncome: 30, totalExpense: 20 });
    const balances = await request(app.getHttpServer()).get('/api/accounts').set(headers()).expect(200);
    expect(balances.body.find((a: Account) => a.id === accounts[0].id).balance).toBe(910);
  });

  it('dos envíos concurrentes con la misma clave producen una sola transferencia', async () => {
    const dto = payload();
    const results = await Promise.all([0, 1].map(() => request(app.getHttpServer()).post('/api/transfers').set(headers()).send(dto).expect(201)));
    expect(results[0].body.id).toBe(results[1].body.id);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(2);
  });

  it('revierte toda la operación cuando falla la inserción de la entrada', async () => {
    const suffix = owner.replaceAll('-', '');
    const functionName = `reject_transfer_${suffix}`;
    const triggerName = `reject_transfer_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${owner}' AND NEW."transferId" IS NOT NULL AND NEW."type" = 'INCOME' THEN RAISE EXCEPTION 'simulated transfer write failure'; END IF; RETURN NEW; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
      await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(payload()).expect(500);
      expect(await prisma.transfer.count({ where: { userId: owner } })).toBe(0);
      expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "Transaction"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
  });

  it('rechaza transferencias a la misma cuenta, importes inválidos y fechas inválidas', async () => {
    const dto = payload();
    for (const changes of [{ toAccountId: dto.fromAccountId }, { amount: 0 }, { amount: 1.001 }, { amount: 1e15 }, { date: '2026-02-30' }, { destinationAmount: null }]) {
      await request(app.getHttpServer()).post('/api/transfers').set(headers()).send({ ...dto, ...changes }).expect(400);
    }
    expect(await prisma.transfer.count({ where: { userId: owner } })).toBe(0);
  });

  it('protege las cuentas y transferencias de otros usuarios', async () => {
    const result = await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(payload()).expect(201);
    await request(app.getHttpServer()).post('/api/transfers').set({ Authorization: `Bearer ${otherToken}` }).send(payload()).expect(404);
    const list = await request(app.getHttpServer()).get('/api/transfers').set({ Authorization: `Bearer ${otherToken}` }).expect(200);
    expect(list.body.total).toBe(0);
    await request(app.getHttpServer()).delete(`/api/transfers/${result.body.id}`).set({ Authorization: `Bearer ${otherToken}` }).expect(404);
    expect(await prisma.transaction.count({ where: { transferId: result.body.id } })).toBe(2);
  });

  it('exige el importe recibido al cambiar moneda y preserva ambas monedas', async () => {
    const dto = { ...payload(), toAccountId: accounts[2].id };
    await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(dto).expect(400);
    const result = await request(app.getHttpServer()).post('/api/transfers').set(headers()).send({ ...dto, destinationAmount: 0.03 }).expect(201);
    const legs = await prisma.transaction.findMany({ where: { transferId: result.body.id } });
    expect(legs.find(t => t.type === 'EXPENSE')!.currency).toBe('COP');
    expect(legs.find(t => t.type === 'INCOME')!.currency).toBe('USD');
    expect(Number(legs.find(t => t.type === 'INCOME')!.amount)).toBe(0.03);
    await request(app.getHttpServer()).post('/api/transfers').set(headers()).send({ ...payload(), destinationAmount: 99 }).expect(400);
  });

  it('rechaza cuentas archivadas y no guarda partes sueltas', async () => {
    await prisma.account.update({ where: { id: accounts[1].id }, data: { archived: true } });
    await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(payload()).expect(400);
    expect(await prisma.transfer.count({ where: { userId: owner } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
  });

  it('no permite editar o eliminar una sola parte y elimina el par completo', async () => {
    const result = await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(payload()).expect(201);
    const leg = await prisma.transaction.findFirstOrThrow({ where: { transferId: result.body.id } });
    await request(app.getHttpServer()).patch(`/api/transactions/${leg.id}`).set(headers()).send({ amount: 1 }).expect(400);
    await request(app.getHttpServer()).delete(`/api/transactions/${leg.id}`).set(headers()).expect(400);
    await request(app.getHttpServer()).delete(`/api/accounts/${accounts[0].id}`).set(headers()).expect(409);
    await request(app.getHttpServer()).delete(`/api/transfers/${result.body.id}`).set(headers()).expect(204);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
    const balances = await request(app.getHttpServer()).get('/api/accounts').set(headers()).expect(200);
    expect(balances.body.find((a: Account) => a.id === accounts[0].id).balance).toBe(1000);
    expect(balances.body.find((a: Account) => a.id === accounts[1].id).balance).toBe(0);
  });

  it('permite filtrar las transferencias y las excluye de filtros de ingresos y gastos', async () => {
    await request(app.getHttpServer()).post('/api/transfers').set(headers()).send(payload()).expect(201);
    for (const type of ['INCOME', 'EXPENSE']) {
      const list = await request(app.getHttpServer()).get(`/api/transactions?type=${type}`).set(headers()).expect(200);
      expect(list.body.total).toBe(0);
    }
    const transferLegs = await request(app.getHttpServer()).get('/api/transactions?type=TRANSFER').set(headers()).expect(200);
    expect(transferLegs.body.total).toBe(2);
    const byAccount = await request(app.getHttpServer()).get(`/api/transfers?accountId=${accounts[2].id}`).set(headers()).expect(200);
    expect(byAccount.body.total).toBe(0);
  });
});
