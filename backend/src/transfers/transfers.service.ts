import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import { QueryTransferDto } from './dto/query-transfer.dto.js';

const include = { fromAccount: true, toAccount: true } as const;
type TransferResult = Prisma.TransferGetPayload<{ include: typeof include }>;

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  private verifyRetry(transfer: TransferResult, dto: CreateTransferDto) {
    if (transfer.fromAccountId !== dto.fromAccountId || transfer.toAccountId !== dto.toAccountId ||
      !transfer.amount.equals(dto.amount) || !transfer.destinationAmount.equals(dto.destinationAmount ?? dto.amount) ||
      transfer.date.getTime() !== new Date(dto.date).getTime() ||
      (transfer.cardStatementId ?? null) !== (dto.cardStatementId ?? null) ||
      (transfer.description ?? '') !== (dto.description?.trim() ?? '')) {
      throw new ConflictException('La solicitud ya se usó para otra transferencia. Abre un formulario nuevo.');
    }
    return transfer;
  }

  async create(userId: string, dto: CreateTransferDto) {
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException('El origen y el destino deben ser cuentas distintas');
    const where = { userId_requestId: { userId, requestId: dto.requestId } };
    const previous = await this.prisma.transfer.findUnique({ where, include });
    if (previous) return this.verifyRetry(previous, dto);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const accounts = await tx.account.findMany({ where: { userId, id: { in: [dto.fromAccountId, dto.toAccountId] } } });
          const source = accounts.find(a => a.id === dto.fromAccountId);
          const destination = accounts.find(a => a.id === dto.toAccountId);
          if (!source || !destination) throw new NotFoundException('Cuenta no encontrada');
          if (source.archived || destination.archived) throw new BadRequestException('No puedes transferir desde o hacia una cuenta archivada');
          const differentCurrencies = source.currency !== destination.currency;
          if (differentCurrencies && dto.destinationAmount === undefined) {
            throw new BadRequestException('Indica el importe recibido en la moneda de destino');
          }
          const destinationAmount = new Prisma.Decimal(dto.destinationAmount ?? dto.amount);
          if (!differentCurrencies && !destinationAmount.equals(dto.amount)) {
            throw new BadRequestException('Los importes deben coincidir cuando las cuentas tienen la misma moneda');
          }
          if (dto.cardStatementId) {
            const statement = await tx.cardStatement.findFirst({ where: { id: dto.cardStatementId, cardAccountId: destination.id, cardAccount: { userId } } });
            if (!statement) throw new NotFoundException('Extracto no encontrado para esta tarjeta');
            if (await tx.cardStatement.findFirst({ where: { cardAccountId: destination.id, closingDate: { gt: statement.closingDate } }, select: { id: true } })) throw new BadRequestException('Registra el pago contra el extracto más reciente de la tarjeta');
            if (source.type === 'CREDIT_CARD' || destination.type !== 'CREDIT_CARD' || differentCurrencies) throw new BadRequestException('Paga desde una cuenta bancaria o efectivo en la misma moneda de la tarjeta');
            if (new Date(dto.date) < statement.closingDate) throw new BadRequestException('El pago no puede ser anterior al corte del extracto');
            const paid = await tx.transfer.aggregate({ where: { userId, toAccountId: destination.id, OR: [{ cardStatementId: statement.id }, { date: { gt: statement.closingDate } }] }, _sum: { destinationAmount: true } });
            if (new Prisma.Decimal(paid._sum.destinationAmount ?? 0).plus(destinationAmount).greaterThan(statement.total)) throw new BadRequestException('El pago supera el saldo pendiente del extracto, incluidos pagos futuros registrados');
          }
          const transfer = await tx.transfer.create({
            data: {
              userId, fromAccountId: source.id, toAccountId: destination.id,
              amount: dto.amount, destinationAmount, cardStatementId: dto.cardStatementId ?? null, date: new Date(dto.date),
              description: dto.description?.trim() || null, requestId: dto.requestId,
            },
            include,
          });
          await tx.transaction.createMany({ data: [
            { userId, transferId: transfer.id, accountId: source.id, type: 'EXPENSE', amount: dto.amount,
              currency: source.currency, date: transfer.date, description: `Transferencia a ${destination.name}`, notes: transfer.description },
            { userId, transferId: transfer.id, accountId: destination.id, type: 'INCOME', amount: destinationAmount,
              currency: destination.currency, date: transfer.date, description: `Transferencia desde ${source.name}`, notes: transfer.description },
          ] });
          return transfer;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2034') {
            if (attempt < 2) continue;
            throw new ConflictException('Hay otra operación en curso. Vuelve a intentar el mismo envío.');
          }
          if (error.code === 'P2002') {
            const existing = await this.prisma.transfer.findUnique({ where, include });
            if (existing) return this.verifyRetry(existing, dto);
          }
        }
        throw error;
      }
    }
    throw new ConflictException('No se pudo completar la transferencia. Vuelve a intentarlo.');
  }

  async findAll(userId: string, query: QueryTransferDto) {
    const { page = 1, pageSize = 25, accountId } = query;
    const where: Prisma.TransferWhereInput = { userId, ...(accountId ? { OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({ where, include, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.transfer.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async remove(userId: string, id: string) {
    // La FK elimina ambos movimientos en la misma sentencia; nunca queda una sola parte.
    const result = await this.prisma.transfer.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Transferencia no encontrada');
  }
}
