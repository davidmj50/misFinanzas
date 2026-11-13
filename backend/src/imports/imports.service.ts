import { CategorizationRulesService } from '../categorization-rules/categorization-rules.service.js';
import { matchRule } from '../categorization-rules/rule-matcher.js';
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommitImportDto, ImportRowDto, PreviewImportDto } from './dto/import.dto.js';

const normalize = (value?: string | null) => (value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Db = Prisma.TransactionClient;
type Status = 'NEW' | 'DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'INVALID';
export interface Decision { rowId: number; status: Status; reason: string; canForce: boolean; duplicateTransactionId?: string; categoryId?: string | null; matchedRule?: { id: string; name: string } | null; }
const existingSelect = { id: true, date: true, type: true, amount: true, currency: true, merchant: true, description: true, externalRef: true, transferId: true } as const;
type Existing = Prisma.TransactionGetPayload<{ select: typeof existingSelect }>;

function keys(row: Pick<ImportRowDto, 'date' | 'type' | 'amount' | 'merchant' | 'description'>, currency: string) {
  const coarse = JSON.stringify([row.date, row.type, new Prisma.Decimal(row.amount).toFixed(2), currency]);
  return { coarse, exact: JSON.stringify([coarse, normalize(row.merchant), normalize(row.description)]) };
}

function sourceRef(accountId: string, row: ImportRowDto, currency: string) {
  return row.externalRef?.trim()
    ? `import:ref:${hash([accountId, row.externalRef.trim()])}`
    : `import:row:${hash([accountId, keys(row, currency).exact])}`;
}

const result = (batch: { id: string; imported: number; skipped: number; total: number; createdAt: Date }) => ({
  batchId: batch.id, imported: batch.imported, skipped: batch.skipped, total: batch.total, createdAt: batch.createdAt,
});

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService, private readonly rules: CategorizationRulesService) {}

  private async prepare(db: Db, userId: string, dto: PreviewImportDto) {
    const account = await db.account.findFirst({ where: { id: dto.accountId, userId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (account.archived) throw new BadRequestException('No puedes importar a una cuenta archivada');
    const rules = await this.rules.list(userId, db);
    const categoryIds = [...new Set(dto.rows.flatMap(r => r.categoryId ? [r.categoryId] : []))];
    const categories = await db.category.findMany({ where: { userId, id: { in: categoryIds } }, select: { id: true, type: true } });
    const categoryMap = new Map(categories.map(c => [c.id, c.type]));
    const dates = dto.rows.map(r => r.date).sort();
    const end = new Date(dates[dates.length - 1]);
    end.setUTCDate(end.getUTCDate() + 1);
    const refs = dto.rows.flatMap(r => [sourceRef(account.id, r, account.currency), ...(r.externalRef?.trim() ? [r.externalRef.trim()] : [])]);
    const existing = await db.transaction.findMany({
      where: { userId, accountId: account.id, OR: [
        { date: { gte: new Date(dates[0]), lt: end } }, { externalRef: { in: refs } },
      ] }, select: existingSelect,
    });
    const byRef = new Map(existing.filter(t => t.externalRef).map(t => [t.externalRef!, t]));
    const byExact = new Map<string, Existing>();
    const byCoarse = new Map<string, Existing>();
    for (const t of existing) {
      const key = keys({ ...t, date: t.date.toISOString().slice(0, 10), amount: Number(t.amount), merchant: t.merchant ?? undefined, description: t.description ?? undefined }, t.currency);
      byExact.set(key.exact, t); byCoarse.set(key.coarse, t);
    }
    const seenRefs = new Set<string>();
    const seenExact = new Set<string>();
    const seenCoarse = new Set<string>();
    const decisions: Decision[] = [];
    for (const row of [...dto.rows].sort((a, b) => a.rowId - b.rowId)) {
      let invalid = '';
      if (row.currency && row.currency !== account.currency) invalid = `La moneda debe ser ${account.currency}`;
      if (row.categoryId && categoryMap.get(row.categoryId) !== row.type) invalid = 'La categoría no está disponible o no corresponde al tipo de movimiento';
      if (invalid) { decisions.push({ rowId: row.rowId, status: 'INVALID', reason: invalid, canForce: false }); continue; }
      const rule = row.categoryId === undefined ? matchRule(rules, row, account.id) : undefined;
      const categoryId = row.categoryId ?? rule?.categoryId ?? null;
      const matchedRule = rule ? { id: rule.id, name: rule.name } : null;
      const ref = sourceRef(account.id, row, account.currency);
      const bankRef = row.externalRef?.trim();
      const key = keys(row, account.currency);
      const sameReference = byRef.get(ref) ?? (bankRef ? byRef.get(bankRef) : undefined);
      const exact = byExact.get(key.exact);
      const possible = byCoarse.get(key.coarse);
      const hardDuplicate = !!bankRef && (!!sameReference || seenRefs.has(ref));
      const duplicate = !!sameReference || !!exact || seenRefs.has(ref) || seenExact.has(key.exact);
      const status: Status = duplicate ? 'DUPLICATE' : possible || seenCoarse.has(key.coarse) ? 'POSSIBLE_DUPLICATE' : 'NEW';
      const match = sameReference ?? exact ?? possible;
      const reason = hardDuplicate ? 'La referencia del extracto ya está registrada o repetida en este archivo'
        : match?.transferId ? 'Coincide con una transferencia registrada; revisa antes de importar como ingreso o gasto'
        : duplicate ? 'Coincide con un movimiento existente o una fila anterior del archivo'
        : status === 'POSSIBLE_DUPLICATE' ? 'Misma fecha, tipo e importe; revisa si es otra operación'
        : 'Movimiento nuevo';
      decisions.push({ rowId: row.rowId, status, reason, canForce: status !== 'NEW' && !hardDuplicate, duplicateTransactionId: match?.id, categoryId, matchedRule });
      seenRefs.add(ref); seenExact.add(key.exact); seenCoarse.add(key.coarse);
    }
    return { account, decisions };
  }

  async preview(userId: string, dto: PreviewImportDto) {
    const prepared = await this.prepare(this.prisma, userId, dto);
    return { currency: prepared.account.currency, rows: prepared.decisions };
  }

  async commit(userId: string, dto: CommitImportDto) {
    const contentHash = hash([dto.accountId, dto.fileName, [...dto.rows].sort((a, b) => a.rowId - b.rowId).map(r => [
      r.rowId, r.date, r.type, new Prisma.Decimal(r.amount).toFixed(2), r.description?.trim() ?? '', r.merchant?.trim() ?? '',
      r.notes?.trim() ?? '', r.categoryId === undefined ? 'AUTO' : r.categoryId, r.currency ?? '', r.externalRef?.trim() ?? '', !!r.allowDuplicate,
    ])]);
    const where = { userId_requestId: { userId, requestId: dto.requestId } };
    const previous = await this.prisma.importBatch.findUnique({ where });
    if (previous) {
      if (previous.contentHash !== contentHash) throw new ConflictException('La solicitud ya se usó con otros datos. Genera una nueva vista previa.');
      return result(previous);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async tx => {
          const { account, decisions } = await this.prepare(tx, userId, dto);
          if (decisions.some(d => d.status === 'INVALID')) throw new BadRequestException('Hay filas inválidas. Genera de nuevo la vista previa.');
          const decisionMap = new Map(decisions.map(d => [d.rowId, d]));
          const selected = dto.rows.filter(row => {
            const decision = decisionMap.get(row.rowId)!;
            return decision.status === 'NEW' || (decision.canForce && row.allowDuplicate);
          });
          const batch = await tx.importBatch.create({ data: { userId, accountId: account.id, requestId: dto.requestId, contentHash,
            fileName: dto.fileName, total: dto.rows.length, imported: selected.length, skipped: dto.rows.length - selected.length } });
          if (selected.length) await tx.transaction.createMany({ data: selected.map(row => ({
            userId, accountId: account.id, importBatchId: batch.id, date: new Date(row.date), type: row.type,
            amount: row.amount, currency: account.currency, categoryId: decisionMap.get(row.rowId)!.categoryId ?? null,
            description: row.description?.trim() || null, merchant: row.merchant?.trim() || null, notes: row.notes?.trim() || null,
            externalRef: (row.externalRef?.trim() || !row.allowDuplicate) ? sourceRef(account.id, row, account.currency)
              : `import:forced:${hash([account.id, dto.requestId, row.rowId])}`,
          })) });
          return result(batch);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
          const previous = await this.prisma.importBatch.findUnique({ where });
          if (previous) {
            if (previous.contentHash !== contentHash) throw new ConflictException('La solicitud ya se usó con otros datos.');
            return result(previous);
          }
          if (attempt < 2) continue;
          throw new ConflictException('Otro proceso cambió los movimientos. Reintenta el mismo envío.');
        }
        throw error;
      }
    }
    throw new ConflictException('No se pudo completar la importación');
  }
}
