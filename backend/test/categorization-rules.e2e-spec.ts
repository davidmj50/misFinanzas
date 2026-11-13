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
import { CategorizationRulesModule } from '../src/categorization-rules/categorization-rules.module.js';
import { CategoriesModule } from '../src/categories/categories.module.js';
import { ImportsModule } from '../src/imports/imports.module.js';
import { AccountsModule } from '../src/accounts/accounts.module.js';
import { TransactionsModule } from '../src/transactions/transactions.module.js';

describe.runIf(process.env.RUN_RULE_DB_TESTS === 'true')('Reglas: API, importación y PostgreSQL', () => {
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
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, ImportsModule, AccountsModule, TransactionsModule, CategorizationRulesModule, CategoriesModule] }).compile();
    app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    await prisma.user.createMany({ data: [owner, other].map(id => ({ id, email: `${id}@import.test`, name: 'Import test', passwordHash: 'unused' })) });
    foreign = await prisma.account.create({ data: { userId: other, name: 'Ajena', type: 'BANK' } });
    token = app.get(JwtService).sign({ sub: owner });
  });
  beforeEach(async () => {
    await prisma.categorizationRule.deleteMany({ where: { userId: owner } });
    await prisma.category.deleteMany({ where: { userId: owner } });
    await prisma.transfer.deleteMany({ where: { userId: owner } });
    await prisma.account.deleteMany({ where: { userId: owner } });
    account = await prisma.account.create({ data: { userId: owner, name: 'Banco', type: 'BANK', currency: 'COP' } });
    spare = await prisma.account.create({ data: { userId: owner, name: 'Otra', type: 'BANK', currency: 'COP' } });
  });
  afterAll(async () => {
    try { if (prisma) await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } }); }
    finally { if (app) await app.close(); }
  });


  const createCategory = (type: 'EXPENSE' | 'INCOME' = 'EXPENSE', userId = owner) => prisma.category.create({ data: { userId, name: randomUUID(), type } });
  const rulePayload = (categoryId: string) => ({ name: 'Cafetería', field: 'ANY' as const, operator: 'CONTAINS' as const, pattern: 'cafe', priority: 100, active: true, categoryId, accountId: null });
  const createRule = (data: object) => request(app.getHttpServer()).post('/api/categorization-rules').set(headers()).send(data);
  const testRule = (data: object = {}) => request(app.getHttpServer()).post('/api/categorization-rules/test').set(headers()).send({ accountId: account.id, type: 'EXPENSE', description: '  CAFÉ  del barrio ', ...data });

  it('protege todas las rutas y aísla los datos de otros usuarios', async () => {
    await request(app.getHttpServer()).get('/api/categorization-rules').expect(401);
    const category = await createCategory('EXPENSE', other);
    const hidden = await prisma.categorizationRule.create({ data: { ...rulePayload(category.id), userId: other } });
    expect((await request(app.getHttpServer()).get('/api/categorization-rules').set(headers()).expect(200)).body).toEqual([]);
    await request(app.getHttpServer()).put('/api/categorization-rules/' + hidden.id).set(headers()).send(rulePayload(category.id)).expect(404);
    await request(app.getHttpServer()).delete('/api/categorization-rules/' + hidden.id).set(headers()).expect(404);
    await createRule(rulePayload(category.id)).expect(400);
    await createRule({ ...rulePayload((await createCategory()).id), accountId: foreign.id }).expect(400);
    await testRule({ accountId: foreign.id }).expect(404);
  });

  it('crea, ordena, edita, desactiva y elimina reglas', async () => {
    const category = await createCategory();
    const first = (await createRule(rulePayload(category.id)).expect(201)).body;
    const second = (await createRule({ ...rulePayload(category.id), name: 'Primera', priority: 0 }).expect(201)).body;
    const list = await request(app.getHttpServer()).get('/api/categorization-rules').set(headers()).expect(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([second.id, first.id]);
    await request(app.getHttpServer()).put('/api/categorization-rules/' + second.id).set(headers()).send({ ...rulePayload(category.id), active: false }).expect(200);
    expect((await testRule().expect(201)).body.matchedRule.id).toBe(first.id);
    await request(app.getHttpServer()).delete('/api/categorization-rules/' + first.id).set(headers()).expect(204);
    expect((await testRule().expect(201)).body.categoryId).toBeNull();
  });

  it('normaliza tildes, mayúsculas y espacios y busca cada campo por separado', async () => {
    const category = await createCategory();
    const rule = (await createRule({ ...rulePayload(category.id), field: 'MERCHANT', operator: 'EQUALS', pattern: ' Café   LOCAL ' }).expect(201)).body;
    expect((await testRule({ merchant: 'CAFE local', description: '' }).expect(201)).body.categoryId).toBe(category.id);
    expect((await testRule({ merchant: '', description: 'Café local' }).expect(201)).body.categoryId).toBeNull();
    expect((await testRule({ merchant: 'otro Café local' }).expect(201)).body.categoryId).toBeNull();
    await request(app.getHttpServer()).put('/api/categorization-rules/' + rule.id).set(headers()).send({ ...rulePayload(category.id), field: 'DESCRIPTION', operator: 'STARTS_WITH', pattern: 'cafe' }).expect(200);
    expect((await testRule().expect(201)).body.categoryId).toBe(category.id);
    expect((await testRule({ description: 'Compra café' }).expect(201)).body.categoryId).toBeNull();
  });

  it('respeta prioridad, desempate estable, cuenta y tipo de categoría', async () => {
    const expense = await createCategory(), income = await createCategory('INCOME');
    await createRule({ ...rulePayload(income.id), priority: 0 }).expect(201);
    await createRule({ ...rulePayload(expense.id), priority: 1, accountId: spare.id }).expect(201);
    const older = (await createRule({ ...rulePayload(expense.id), priority: 2 }).expect(201)).body;
    await createRule({ ...rulePayload(expense.id), priority: 2 }).expect(201);
    expect((await testRule().expect(201)).body.matchedRule.id).toBe(older.id);
    expect((await testRule({ type: 'INCOME' }).expect(201)).body.categoryId).toBe(income.id);
    expect((await testRule({ accountId: spare.id }).expect(201)).body.matchedRule.id).not.toBe(older.id);
  });

  it('sugiere sin escribir y guarda automáticamente al importar sin categoría', async () => {
    const category = await createCategory();
    const rule = (await createRule(rulePayload(category.id)).expect(201)).body;
    const checked = await preview([row()]).expect(201);
    expect(checked.body.rows[0]).toMatchObject({ categoryId: category.id, matchedRule: { id: rule.id, name: 'Cafetería' }, status: 'NEW' });
    expect(await prisma.transaction.count({ where: { userId: owner } })).toBe(0);
    const dto = payload();
    const saved = await commit(dto).expect(201);
    expect((await prisma.transaction.findFirstOrThrow({ where: { importBatchId: saved.body.batchId } })).categoryId).toBe(category.id);
    await request(app.getHttpServer()).delete('/api/categorization-rules/' + rule.id).set(headers()).expect(204);
    expect((await commit(dto).expect(201)).body.batchId).toBe(saved.body.batchId);
    expect((await preview([row()]).expect(201)).body.rows[0].status).toBe('DUPLICATE');
  });

  it('respeta categorías explícitas y permite dejar sin categoría con null', async () => {
    const automatic = await createCategory(), explicit = await createCategory();
    await createRule(rulePayload(automatic.id)).expect(201);
    const checked = await preview([{ ...row(), categoryId: explicit.id }, { ...row(3), amount: 200, categoryId: null }]).expect(201);
    expect(checked.body.rows.map((r: { categoryId: string | null }) => r.categoryId)).toEqual([explicit.id, null]);
    expect(checked.body.rows.every((r: { matchedRule: unknown }) => r.matchedRule === null)).toBe(true);
    const result = await commit(payload([{ ...row(), categoryId: explicit.id }, { ...row(3), amount: 200, categoryId: null }])).expect(201);
    const saved = await prisma.transaction.findMany({ where: { importBatchId: result.body.batchId }, orderBy: { amount: 'asc' } });
    expect(saved.map(r => r.categoryId)).toEqual([explicit.id, null]);
  });

  it('conserva la categoría revisada si cambian las reglas antes de guardar', async () => {
    const original = await createCategory(), changed = await createCategory();
    const rule = (await createRule(rulePayload(original.id)).expect(201)).body;
    const checked = (await preview([row()]).expect(201)).body.rows[0];
    await request(app.getHttpServer()).put('/api/categorization-rules/' + rule.id).set(headers()).send(rulePayload(changed.id)).expect(200);
    const result = await commit(payload([{ ...row(), categoryId: checked.categoryId }])).expect(201);
    expect((await prisma.transaction.findFirstOrThrow({ where: { importBatchId: result.body.batchId } })).categoryId).toBe(original.id);
    expect((await preview([{ ...row(3), amount: 200 }]).expect(201)).body.rows[0].categoryId).toBe(changed.id);
  });

  it('distingue AUTO y null en la clave idempotente', async () => {
    const category = await createCategory();
    await createRule(rulePayload(category.id)).expect(201);
    const dto = payload();
    await commit(dto).expect(201);
    await commit({ ...dto, rows: [{ ...row(), categoryId: null }] }).expect(409);
  });

  it('valida parámetros y evita patrones vacíos o prioridades inválidas', async () => {
    const category = await createCategory();
    for (const change of [{ name: '  ' }, { pattern: '  ' }, { pattern: '\u0301' }, { priority: -1 }, { priority: 1.5 }, { priority: 10000 }, { field: 'UNKNOWN' }, { operator: 'REGEX' }, { active: null }, { categoryId: null }]) {
      await createRule({ ...rulePayload(category.id), ...change }).expect(400);
    }
  });

  it('protege el tipo de categorías usadas y elimina reglas vinculadas sin ampliar su alcance', async () => {
    const category = await createCategory();
    await createRule({ ...rulePayload(category.id), accountId: spare.id }).expect(201);
    await request(app.getHttpServer()).patch('/api/categories/' + category.id).set(headers()).send({ type: 'INCOME' }).expect(400);
    await prisma.account.delete({ where: { id: spare.id } });
    expect(await prisma.categorizationRule.count({ where: { userId: owner } })).toBe(0);
    await createRule(rulePayload(category.id)).expect(201);
    await request(app.getHttpServer()).delete('/api/categories/' + category.id).set(headers()).expect(200);
    expect(await prisma.categorizationRule.count({ where: { userId: owner } })).toBe(0);
  });
});
