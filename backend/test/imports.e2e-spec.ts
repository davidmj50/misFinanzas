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
import { ImportsModule } from '../src/imports/imports.module.js';
import { AccountsModule } from '../src/accounts/accounts.module.js';
import { TransactionsModule } from '../src/transactions/transactions.module.js';

describe.runIf(process.env.RUN_IMPORT_DB_TESTS === 'true')('Importación: API y PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let account: Account;
  let spare: Account;
  let foreign: Account;
  let token: string;
  const owner = randomUUID(), other = randomUUID();
  const row = (rowId = 2) => ({ rowId, date: '2026-11-12', type: 'EXPENSE', amount: 100, description: 'Café', merchant: 'Local' });
  const headers = () => ({ Authorization: `Bearer ${token}` });
  const payload = (rows: object[] = [row()]) => ({ accountId: account.id, fileName: 'extracto.csv', requestId: randomUUID(), rows });
  const commit = (dto: object) => request(app.getHttpServer()).post('/api/imports/commit').set(headers()).send(dto);
  const preview = (rows: object[], accountId = account.id) => request(app.getHttpServer()).post('/api/imports/preview').set(headers()).send({ accountId, rows });

  beforeAll(async () => {
    if (!['localhost', '127.0.0.1', 'postgres'].includes(new URL(process.env.DATABASE_URL ?? '').hostname)) throw new Error('Las pruebas de importación solo pueden usar PostgreSQL local.');
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, ImportsModule, AccountsModule, TransactionsModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    await prisma.user.createMany({ data: [owner, other].map(id => ({ id, email: `${id}@import.test`, name: 'Import test', passwordHash: 'unused' })) });
    foreign = await prisma.account.create({ data: { userId: other, name: 'Ajena', type: 'BANK' } });
    token = app.get(JwtService).sign({ sub: owner });
  });
  beforeEach(async () => {
    await prisma.transfer.deleteMany({ where: { userId: owner } });
    await prisma.account.deleteMany({ where: { userId: owner } });
    account = await prisma.account.create({ data: { userId: owner, name: 'Banco', type: 'BANK', currency: 'COP' } });
    spare = await prisma.account.create({ data: { userId: owner, name: 'Otra', type: 'BANK', currency: 'COP' } });
  });
  afterAll(async () => {
    try { if (prisma) await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } }); }
    finally { if (app) await app.close(); }
  });

  it('exige autenticación y no escribe datos al revisar', async () => {
    await request(app.getHttpServer()).post('/api/imports/preview').send({ accountId: account.id, rows: [row()] }).expect(401);
    const result = await preview([row()]).expect(201);
    expect(result.body.rows[0].status).toBe('NEW');
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
    expect(await prisma.importBatch.count({ where: { userId: owner } })).toBe(0);
  });

  it('distingue duplicados internos, coincidencias posibles y monedas inválidas', async () => {
    const result = await preview([row(), row(3), { ...row(4), description: 'Taxi' }, { ...row(5), currency: 'USD' }]).expect(201);
    expect(result.body.rows.map((r: { status: string }) => r.status)).toEqual(['NEW', 'DUPLICATE', 'POSSIBLE_DUPLICATE', 'INVALID']);
  });

  it('guarda el lote y sus movimientos, actualiza saldos y conserva los campos', async () => {
    const category = await prisma.category.create({ data: { userId: owner, name: randomUUID(), type: 'EXPENSE' } });
    const result = await commit(payload([{ ...row(), categoryId: category.id }])).expect(201);
    expect(result.body).toMatchObject({ imported: 1, skipped: 0, total: 1 });
    const saved = await prisma.transaction.findFirstOrThrow({ where: { userId: owner } });
    expect(saved).toMatchObject({ importBatchId: result.body.batchId, categoryId: category.id, currency: 'COP', description: 'Café', merchant: 'Local' });
    const balances = await request(app.getHttpServer()).get('/api/accounts').set(headers()).expect(200);
    expect(balances.body.find((a: Account) => a.id === account.id).balance).toBe(-100);
    const summary = await request(app.getHttpServer()).get('/api/transactions/summary').set(headers()).expect(200);
    expect(summary.body.totalExpense).toBe(100);
  });

  it('reimportar el archivo no duplica y reintentar la clave devuelve el mismo resultado', async () => {
    const dto = payload();
    const first = await commit(dto).expect(201);
    const repeated = await commit(dto).expect(201);
    expect(repeated.body).toEqual(first.body);
    const newAttempt = await commit({ ...dto, requestId: randomUUID() }).expect(201);
    expect(newAttempt.body).toMatchObject({ imported: 0, skipped: 1 });
    await commit({ ...dto, rows: [{ ...row(), amount: 200 }] }).expect(409);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(1);
  });

  it('detecta movimientos manuales con espacios y mayúsculas y permite incluir otra compra idéntica explícitamente', async () => {
    await prisma.transaction.create({ data: { userId: owner, accountId: account.id, date: new Date('2026-11-12'), type: 'EXPENSE', amount: 100, currency: 'COP', description: '  CAFÉ ', merchant: 'LOCAL' } });
    const checked = await preview([row()]).expect(201);
    expect(checked.body.rows[0]).toMatchObject({ status: 'DUPLICATE', canForce: true });
    const forced = payload([{ ...row(), allowDuplicate: true }]);
    await commit(forced).expect(201);
    await commit(forced).expect(201);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(2);
  });

  it('una referencia bancaria es única dentro de la cuenta y no puede forzarse', async () => {
    const dto = payload([{ ...row(), externalRef: 'bank-001' }]);
    await commit(dto).expect(201);
    const checked = await preview([{ ...row(), amount: 300, externalRef: 'bank-001' }]).expect(201);
    expect(checked.body.rows[0]).toMatchObject({ status: 'DUPLICATE', canForce: false });
    const again = await commit(payload([{ ...row(), externalRef: 'bank-001', allowDuplicate: true }])).expect(201);
    expect(again.body.imported).toBe(0);
    const otherAccount = await commit({ ...payload([{ ...row(), externalRef: 'bank-001' }]), accountId: spare.id }).expect(201);
    expect(otherAccount.body.imported).toBe(1);
  });

  it('revalida al guardar si apareció un movimiento después de la vista previa', async () => {
    expect((await preview([row()]).expect(201)).body.rows[0].status).toBe('NEW');
    await commit(payload()).expect(201);
    const second = await commit(payload()).expect(201);
    expect(second.body).toMatchObject({ imported: 0, skipped: 1 });
  });

  it('protege cuentas, categorías, monedas y cuentas archivadas', async () => {
    await preview([row()], foreign.id).expect(404);
    const category = await prisma.category.create({ data: { userId: other, name: randomUUID(), type: 'EXPENSE' } });
    const invalid = await preview([{ ...row(), categoryId: category.id }]).expect(201);
    expect(invalid.body.rows[0].status).toBe('INVALID');
    await commit(payload([{ ...row(), currency: 'USD' }])).expect(400);
    await prisma.account.update({ where: { id: account.id }, data: { archived: true } });
    await commit(payload()).expect(400);
    expect(await prisma.importBatch.count({ where: { userId: owner } })).toBe(0);
  });

  it('valida filas, límites y fechas sin permitir cantidades inválidas', async () => {
    for (const change of [{ amount: 0 }, { amount: -1 }, { amount: 1.001 }, { date: '2026-02-30' }]) await commit(payload([{ ...row(), ...change }])).expect(400);
    await commit(payload([row(), row()])).expect(400);
    await commit(payload(Array.from({ length: 501 }, (_, i) => row(i + 1)))).expect(400);
  });

  it('dos lotes concurrentes no duplican filas y la misma clave es idempotente', async () => {
    const results = await Promise.all([commit(payload()).expect(201), commit(payload()).expect(201)]);
    expect(results.reduce((sum, r) => sum + r.body.imported, 0)).toBe(1);
    const dto = payload([{ ...row(), amount: 200 }]);
    const same = await Promise.all([commit(dto).expect(201), commit(dto).expect(201)]);
    expect(same[0].body.batchId).toBe(same[1].body.batchId);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(2);
  });

  it('una transferencia existente se marca para revisión y no se importa automáticamente como gasto', async () => {
    const transfer = await prisma.transfer.create({ data: { userId: owner, fromAccountId: account.id, toAccountId: spare.id, amount: 100, destinationAmount: 100, date: new Date('2026-11-12'), requestId: randomUUID() } });
    await prisma.transaction.createMany({ data: [
      { userId: owner, accountId: account.id, transferId: transfer.id, type: 'EXPENSE', amount: 100, currency: 'COP', date: new Date('2026-11-12'), description: 'Transferencia' },
      { userId: owner, accountId: spare.id, transferId: transfer.id, type: 'INCOME', amount: 100, currency: 'COP', date: new Date('2026-11-12'), description: 'Transferencia' },
    ] });
    const checked = await preview([row()]).expect(201);
    expect(checked.body.rows[0].status).toBe('POSSIBLE_DUPLICATE');
    expect(checked.body.rows[0].reason).toContain('transferencia');
    expect((await commit(payload()).expect(201)).body.imported).toBe(0);
  });

  it('revierte el lote completo si falla una escritura', async () => {
    const suffix = owner.replaceAll('-', '');
    const fn = `reject_import_${suffix}`, trigger = `reject_import_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${owner}' AND NEW."importBatchId" IS NOT NULL AND NEW."type" = 'INCOME' THEN RAISE EXCEPTION 'simulated import failure'; END IF; RETURN NEW; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
      await commit(payload([row(), { ...row(3), type: 'INCOME', amount: 200 }])).expect(500);
      expect(await prisma.importBatch.count({ where: { userId: owner } })).toBe(0);
      expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "Transaction"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });
});
