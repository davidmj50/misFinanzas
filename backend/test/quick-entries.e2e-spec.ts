import { testToken } from './auth-session.js';
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
import { QuickEntriesModule } from '../src/quick-entries/quick-entries.module.js';
import { TransactionsModule } from '../src/transactions/transactions.module.js';
describe.runIf(process.env.RUN_QUICK_ENTRY_DB_TESTS === 'true')('Registro rápido: API y PostgreSQL', () => {
  let app: INestApplication, prisma: PrismaService, account: Account, foreign: Account, token: string;
  const owner = randomUUID(), other = randomUUID();
  const api = () => request(app.getHttpServer());
  const headers = () => ({ Authorization: `Bearer ${token}` });
  const input = () => ({ requestId: randomUUID(), accountId: account.id, amount: 100.5, currency: 'COP', date: '2026-11-13', type: 'EXPENSE', merchant: 'Café', description: 'Registro desde el celular' });
  const save = (dto: object = input()) => api().post('/api/quick-entries').set(headers()).send(dto);
  beforeAll(async () => {
    if (!['localhost','127.0.0.1','postgres'].includes(new URL(process.env.DATABASE_URL ?? '').hostname)) throw new Error('Solo PostgreSQL local en estas pruebas.');
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, QuickEntriesModule, TransactionsModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    await prisma.user.createMany({ data: [owner,other].map(id => ({ id, email: `${id}@quick.test`, name: 'Quick test', passwordHash: 'unused' })) });
    foreign = await prisma.account.create({ data: { userId: other, name: 'Ajena', type: 'BANK' } }); token = await testToken(prisma, app.get(JwtService), owner);
  });
  beforeEach(async () => {
    await prisma.account.deleteMany({ where: { userId: owner } }); await prisma.quickEntryRequest.deleteMany({ where: { userId: owner } });
    account = await prisma.account.create({ data: { userId: owner, name: 'Banco', type: 'BANK', initialBalance: 1000 } });
  });
  afterAll(async () => { try { if (prisma) await prisma.user.deleteMany({ where: { id: { in: [owner,other] } } }); } finally { if (app) await app.close(); } });
  it('exige autenticación y solo admite cuentas propias activas', async () => {
    await api().post('/api/quick-entries').send(input()).expect(401);
    await save({ ...input(), accountId: foreign.id }).expect(400);
    expect(await prisma.quickEntryRequest.count({ where: { userId: owner } })).toBe(0);
  });
  it('guarda ingresos y gastos con moneda y categoría compatibles', async () => {
    const category = await prisma.category.create({ data: { userId: owner, name: randomUUID(), type: 'EXPENSE' } });
    const expense = await save({ ...input(), categoryId: category.id }).expect(201);
    const saved = await prisma.transaction.findUniqueOrThrow({ where: { id: expense.body.transactionId } });
    expect(saved).toMatchObject({ userId: owner, type: 'EXPENSE', currency: 'COP', merchant: 'Café', categoryId: category.id });
    expect(Number(saved.amount)).toBe(100.5);
    const income = await save({ ...input(), type: 'INCOME', amount: 50 }).expect(201);
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: income.body.transactionId } })).type).toBe('INCOME');
    const summary = (await api().get('/api/transactions/summary').set(headers()).expect(200)).body;
    expect(summary).toMatchObject({ totalExpense: 100.5, totalIncome: 50 });
  });
  it('reintenta exactamente el mismo registro sin duplicar y rechaza cambiar los datos de su clave', async () => {
    const dto = input(); const first = await save(dto).expect(201);
    expect((await save(dto).expect(201)).body).toEqual(first.body);
    await save({ ...dto, amount: 200 }).expect(409);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(1);
  });
  it('resuelve la misma clave enviada simultáneamente', async () => {
    const dto = input(); const results = await Promise.all([save(dto).expect(201), save(dto).expect(201)]);
    expect(results[0].body).toEqual(results[1].body); expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(1);
  });
  it('dos operaciones intencionales iguales con distintas claves se conservan', async () => {
    await Promise.all([save().expect(201), save().expect(201)]);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(2);
  });
  it('rechaza monedas obsoletas y cuentas archivadas sin crear una solicitud confirmada', async () => {
    await save({ ...input(), currency: 'USD' }).expect(400);
    await prisma.account.update({ where: { id: account.id }, data: { archived: true } }); await save().expect(400);
    expect(await prisma.quickEntryRequest.count({ where: { userId: owner } })).toBe(0);
  });
  it('valida fechas, decimales, campos no admitidos y categorías de otros usuarios o tipos', async () => {
    const category = await prisma.category.create({ data: { userId: other, name: randomUUID(), type: 'EXPENSE' } });
    const income = await prisma.category.create({ data: { userId: owner, name: randomUUID(), type: 'INCOME' } });
    for (const change of [{ date: '2026-02-30' }, { amount: 1.001 }, { amount: 0 }, { amount: -1 }, { transferId: randomUUID() }, { categoryId: category.id }, { categoryId: income.id }, { currency: null }]) await save({ ...input(), ...change }).expect(400);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
  });
  it('no recrea un movimiento eliminado al reintentar la misma clave', async () => {
    const dto = input(); const result = await save(dto).expect(201);
    await api().delete('/api/transactions/' + result.body.transactionId).set(headers()).expect(200);
    await save(dto).expect(410); expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
  });
  it('confirma un reintento ya guardado aunque después se archive la cuenta', async () => {
    const dto = input(); const first = await save(dto).expect(201);
    await prisma.account.update({ where: { id: account.id }, data: { archived: true } });
    expect((await save(dto).expect(201)).body).toEqual(first.body);
  });
  it('revierte la solicitud si falla el movimiento y mantiene RLS en la tabla de claves', async () => {
    const suffix = owner.replaceAll('-', ''), fn = `reject_quick_${suffix}`, trigger = `reject_quick_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${owner}' THEN RAISE EXCEPTION 'simulated quick entry failure'; END IF; RETURN NEW; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`); await save().expect(500);
      expect(await prisma.quickEntryRequest.count({ where: { userId: owner } })).toBe(0);
      expect(await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'QuickEntryRequest'`).toEqual([{ relrowsecurity: true }]);
    } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Transaction"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`); }
  });
});
