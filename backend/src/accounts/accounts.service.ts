import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

    const accountIds = accounts.map((a) => a.id);
    const [totals, transfersOut, transfersIn] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['accountId', 'type'],
        where: { userId, accountId: { in: accountIds } },
        _sum: { amount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['fromAccountId'],
        where: { userId, fromAccountId: { in: accountIds } },
        _sum: { amount: true },
      }),
      this.prisma.transfer.groupBy({
        by: ['toAccountId'],
        where: { userId, toAccountId: { in: accountIds } },
        _sum: { amount: true },
      }),
    ]);
    const outMap = new Map(transfersOut.map((t) => [t.fromAccountId, Number(t._sum.amount ?? 0)]));
    const inMap = new Map(transfersIn.map((t) => [t.toAccountId, Number(t._sum.amount ?? 0)]));

    return accounts.map((account) => ({
      ...account,
      balance:
        this.computeBalance(account.initialBalance, account.id, totals) +
        (inMap.get(account.id) ?? 0) -
        (outMap.get(account.id) ?? 0),
    }));
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (account.userId !== userId) throw new ForbiddenException();
    return account;
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.findOne(userId, id);
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.account.delete({ where: { id } });
  }

  async getBalanceHistory(userId: string, id: string) {
    const account = await this.findOne(userId, id);

    const [transactions, transfers] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, accountId: id },
        select: { amount: true, type: true, date: true },
      }),
      this.prisma.transfer.findMany({
        where: { userId, OR: [{ fromAccountId: id }, { toAccountId: id }] },
        select: { amount: true, fromAccountId: true, date: true },
      }),
    ]);

    const byMonth = new Map<string, number>();
    const add = (date: Date, signedAmount: number) => {
      const key = monthKey(date);
      byMonth.set(key, (byMonth.get(key) ?? 0) + signedAmount);
    };
    for (const t of transactions) {
      add(t.date, t.type === 'INCOME' ? Number(t.amount) : -Number(t.amount));
    }
    for (const t of transfers) {
      add(t.date, t.fromAccountId === id ? -Number(t.amount) : Number(t.amount));
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
