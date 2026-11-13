import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Account, Transaction } from '@prisma/client';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ExpenseDocumentsModule } from '../src/expense-documents/expense-documents.module.js';
import { TransactionsModule } from '../src/transactions/transactions.module.js';
describe.runIf(process.env.RUN_DOCUMENT_DB_TESTS === 'true')('Comprobantes: API y PostgreSQL', () => {
  let app: INestApplication, prisma: PrismaService, account: Account, expense: Transaction, foreign: Transaction, token: string;
  const owner = randomUUID(), other = randomUUID();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
  const file = (n = 0) => n ? Buffer.concat([png, Buffer.from(String(n))]) : png;
  const headers = () => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());
  const input = () => ({ requestId: randomUUID(), accountId: account.id, date: '2026-11-13', amount: 11900, merchant: 'Mercado prueba' });
  const create = (metadata: object = input(), data = png, filename = 'recibo.png') => api().post('/api/expense-documents/expenses').set(headers()).field('metadata', JSON.stringify(metadata)).attach('files', data, { filename, contentType: 'image/png' });
  const attach = (id = expense.id, data = png, requestId = randomUUID()) => api().post('/api/expense-documents/expenses/' + id).set(headers()).field('metadata', JSON.stringify({ requestId })).attach('files', data, { filename: 'recibo.png', contentType: 'image/png' });
  beforeAll(async () => {
    if (!['localhost','127.0.0.1','postgres'].includes(new URL(process.env.DATABASE_URL ?? '').hostname)) throw new Error('Solo PostgreSQL local en estas pruebas.');
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, ExpenseDocumentsModule, TransactionsModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    await prisma.user.createMany({ data: [owner,other].map(id => ({ id, email: `${id}@document.test`, name: 'Documents test', passwordHash: 'unused' })) });
    const foreignAccount = await prisma.account.create({ data: { userId: other, name: 'Ajena', type: 'BANK' } });
    foreign = await prisma.transaction.create({ data: { userId: other, accountId: foreignAccount.id, type: 'EXPENSE', amount: 10, date: new Date('2026-11-13') } });
    token = app.get(JwtService).sign({ sub: owner });
  });
  beforeEach(async () => {
    await prisma.account.deleteMany({ where: { userId: owner } });
    await prisma.documentUpload.deleteMany({ where: { userId: owner } });
    account = await prisma.account.create({ data: { userId: owner, name: 'Banco', type: 'BANK' } });
    expense = await prisma.transaction.create({ data: { userId: owner, accountId: account.id, type: 'EXPENSE', amount: 10, date: new Date('2026-11-13') } });
  });
  afterAll(async () => { try { if (prisma) await prisma.user.deleteMany({ where: { id: { in: [owner,other] } } }); } finally { if (app) await app.close(); } });
  it('exige autenticación y restringe gastos y documentos a su propietario', async () => {
    await api().get('/api/expense-documents/expenses/' + expense.id).expect(401);
    await attach(foreign.id).expect(404);
    await api().get('/api/expense-documents/expenses/' + foreign.id).set(headers()).expect(404);
    const hidden = await prisma.expenseDocument.create({ data: { userId: other, transactionId: foreign.id, fileName: 'privado.png', mimeType: 'image/png', size: png.length, data: new Uint8Array(png), sha256: randomUUID() } });
    await api().get('/api/expense-documents/' + hidden.id + '/file').set(headers()).expect(404);
    await api().delete('/api/expense-documents/' + hidden.id).set(headers()).expect(404);
  });
  it('guarda gasto y archivo de forma atómica y hereda la moneda de la cuenta', async () => {
    await prisma.account.update({ where: { id: account.id }, data: { currency: 'USD' } });
    const result = (await create().expect(201)).body;
    const saved = await prisma.transaction.findUniqueOrThrow({ where: { id: result.transactionId } });
    expect(saved).toMatchObject({ userId: owner, type: 'EXPENSE', merchant: 'Mercado prueba', currency: 'USD' });
    const documents = (await api().get('/api/expense-documents/expenses/' + result.transactionId).set(headers()).expect(200)).body;
    expect(documents).toHaveLength(1); expect(documents[0]).toMatchObject({ fileName: 'recibo.png', mimeType: 'image/png', size: png.length });
    expect(documents[0]).not.toHaveProperty('data');
    const list = (await api().get('/api/transactions').set(headers()).expect(200)).body.items;
    expect(list.find((t: { id: string }) => t.id === result.transactionId)._count.expenseDocuments).toBe(1);
  });
  it('adjunta y descarga los bytes originales con cabeceras privadas y elimina solo el documento', async () => {
    const result = (await attach().expect(201)).body;
    const id = result.documentIds[0];
    const response = await api().get('/api/expense-documents/' + id + '/file').set(headers()).expect(200);
    expect(Buffer.from(response.body)).toEqual(png);
    expect(response.headers['cache-control']).toContain('no-store'); expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    await api().delete('/api/expense-documents/' + id).set(headers()).expect(204);
    expect(await prisma.transaction.findUnique({ where: { id: expense.id } })).not.toBeNull();
  });
  it('reintenta la misma creación sin duplicar y rechaza reutilizar su clave con otros datos', async () => {
    const dto = input(); const first = (await create(dto).expect(201)).body;
    expect((await create(dto).expect(201)).body).toEqual(first);
    await create({ ...dto, amount: 12000 }).expect(409);
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(2);
    expect(await prisma.expenseDocument.count({ where: { userId: owner } })).toBe(1);
  });
  it('resuelve envíos simultáneos de la misma clave sin duplicar el gasto', async () => {
    const dto = input(); const results = await Promise.all([create(dto).expect(201), create(dto).expect(201)]);
    expect(results[0].body.transactionId).toBe(results[1].body.transactionId);
    expect(await prisma.expenseDocument.count({ where: { userId: owner } })).toBe(1);
  });
  it('limita documentos, detecta el mismo archivo y mantiene el límite bajo concurrencia', async () => {
    await attach().expect(201); await attach(expense.id, file(1)).expect(201);
    await attach().expect(409);
    const results = await Promise.all([attach(expense.id, file(2)), attach(expense.id, file(3))]);
    expect(results.map(r => r.status).sort()).toEqual([201,400]);
    expect(await prisma.expenseDocument.count({ where: { transactionId: expense.id } })).toBe(3);
  });
  it('no admite HTML disfrazado de imagen, archivos grandes ni metadatos manipulados', async () => {
    await create(input(), Buffer.from('<html>no es un recibo</html>'), 'fake.png').expect(400);
    await create(input(), Buffer.alloc(5 * 1024 * 1024 + 1)).expect(413);
    await create({ ...input(), amount: -1 }).expect(400);
    await create({ ...input(), type: 'INCOME' }).expect(400);
    await create({ ...input(), date: '2026-02-30' }).expect(400);
    await api().post('/api/expense-documents/expenses').set(headers()).field('metadata', 'malformed').attach('files', png, 'recibo.png').expect(400);
    expect(await prisma.documentUpload.count({ where: { userId: owner } })).toBe(0);
  });
  it('impide adjuntar a ingresos o transferencias y cambiar un gasto con adjuntos a ingreso', async () => {
    const income = await prisma.transaction.create({ data: { userId: owner, accountId: account.id, type: 'INCOME', amount: 20, date: new Date('2026-11-13') } });
    await attach(income.id).expect(404);
    await attach().expect(201);
    await api().patch('/api/transactions/' + expense.id).set(headers()).send({ type: 'INCOME' }).expect(400);
    await expect(prisma.transaction.update({ where: { id: expense.id }, data: { type: 'INCOME' } })).rejects.toThrow();
    await expect(prisma.expenseDocument.create({ data: { userId: other, transactionId: expense.id, fileName: 'invalid.png', mimeType: 'image/png', size: png.length, sha256: randomUUID(), data: new Uint8Array(png) } })).rejects.toThrow();
  });
  it('elimina adjuntos al borrar el gasto y conserva la clave para no recrearlo al reintentar', async () => {
    const dto = input(); const result = (await create(dto).expect(201)).body;
    await api().delete('/api/transactions/' + result.transactionId).set(headers()).expect(200);
    expect(await prisma.expenseDocument.count({ where: { transactionId: result.transactionId } })).toBe(0);
    await create(dto).expect(410);
  });
  it('revierte el gasto y el lote completo si falla una escritura de archivo', async () => {
    const suffix = owner.replaceAll('-', ''), fn = `reject_doc_${suffix}`, trigger = `reject_doc_trigger_${suffix}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${owner}' THEN RAISE EXCEPTION 'simulated document failure'; END IF; RETURN NEW; END $$`);
    try {
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "ExpenseDocument" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
      await create().expect(500);
      expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(1);
      expect(await prisma.documentUpload.count({ where: { userId: owner } })).toBe(0);
    } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "ExpenseDocument"`); await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`); }
  });
  it('mantiene los adjuntos fuera del acceso directo de roles sin políticas RLS', async () => {
    await attach().expect(201);
    const role = `receipt_reader_${owner.replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN`);
    try {
      await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role}"`);
      await prisma.$executeRawUnsafe(`GRANT SELECT ON "ExpenseDocument", "DocumentUpload" TO "${role}"`);
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        expect(await tx.$queryRawUnsafe('SELECT "id" FROM "ExpenseDocument"')).toEqual([]);
        expect(await tx.$queryRawUnsafe('SELECT "requestId" FROM "DocumentUpload"')).toEqual([]);
      });
    } finally {
      await prisma.$executeRawUnsafe(`REVOKE ALL ON "ExpenseDocument", "DocumentUpload" FROM "${role}"`);
      await prisma.$executeRawUnsafe(`REVOKE ALL ON SCHEMA public FROM "${role}"`);
      await prisma.$executeRawUnsafe(`DROP ROLE "${role}"`);
    }
  });
});
