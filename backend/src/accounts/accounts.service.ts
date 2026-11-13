import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { monthKey } from '../common/dates.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { UpdateAccountDto } from './dto/update-account.dto.js';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: { ...dto, userId },
    });
  }

  async findAll(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (accounts.length === 0) return [];

    const totals = await this.prisma.transaction.groupBy({
      by: ['accountId', 'type'],
      where: { userId, accountId: { in: accounts.map((a) => a.id) } },
      _sum: { amount: true },
    });

    return accounts.map((account) => ({
      ...account,
      balance: this.computeBalance(account.initialBalance, account.id, totals),
    }));
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (account.userId !== userId) throw new ForbiddenException();
    return account;
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    const current = await this.findOne(userId, id);
    if (dto.currency && dto.currency !== current.currency) {
      const [transactions, payments] = await Promise.all([
        this.prisma.transaction.count({ where: { accountId: id } }),
        this.prisma.recurringPayment.count({ where: { accountId: id } }),
      ]);
      if (transactions || payments) throw new BadRequestException('No puedes cambiar la moneda de una cuenta con movimientos o pagos recurrentes');
    }
    if ((dto.type && dto.type !== current.type) || (dto.currency && dto.currency !== current.currency)) {
      const linked = await this.prisma.account.findFirst({ where: { id, OR: [{ cardProfile: { isNot: null } }, { cardsPaidFrom: { some: {} } }, { cardStatements: { some: {} } }] }, select: { id: true } });
      if (linked) throw new BadRequestException('La cuenta está vinculada al control de tarjetas; conserva su tipo y moneda');
    }
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    try {
      return await this.prisma.account.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('La cuenta tiene transferencias vinculadas. Elimina primero las transferencias o archiva la cuenta.');
      }
      throw error;
    }
  }

  async getBalanceHistory(userId: string, id: string) {
    const account = await this.findOne(userId, id);

    const transactions = await this.prisma.transaction.findMany({
      where: { userId, accountId: id },
      select: { amount: true, type: true, date: true },
      orderBy: { date: 'asc' },
    });

    const byMonth = new Map<string, number>();
    for (const t of transactions) {
      const key = monthKey(t.date);
      const signedAmount = t.type === 'INCOME' ? Number(t.amount) : -Number(t.amount);
      byMonth.set(key, (byMonth.get(key) ?? 0) + signedAmount);
    }

    const months = Array.from(byMonth.keys()).sort();
    let runningBalance = Number(account.initialBalance);
    return months.map((month) => {
      runningBalance += byMonth.get(month)!;
      return { month, balance: runningBalance };
    });
  }

  private computeBalance(
    initialBalance: unknown,
    accountId: string,
    totals: { accountId: string; type: string; _sum: { amount: unknown } }[],
  ): number {
    let balance = Number(initialBalance);
    for (const t of totals) {
      if (t.accountId !== accountId) continue;
      const sum = Number(t._sum.amount ?? 0);
      balance += t.type === 'INCOME' ? sum : -sum;
    }
    return balance;
  }
}
