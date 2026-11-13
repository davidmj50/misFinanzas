import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SaveRuleDto, TestRuleDto } from './rule.dto.js';
import { matchRule, normalizeRuleText } from './rule-matcher.js';

@Injectable()
export class CategorizationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, db: Prisma.TransactionClient = this.prisma) {
    return db.categorizationRule.findMany({ where: { userId }, include: { category: { select: { id: true, name: true, type: true } }, account: { select: { id: true, name: true } } }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
  }

  async save(userId: string, dto: SaveRuleDto, id?: string) {
    return this.prisma.$transaction(async tx => {
      if (id && !await tx.categorizationRule.findFirst({ where: { id, userId } })) throw new NotFoundException('Regla no encontrada');
      if (!normalizeRuleText(dto.pattern)) throw new BadRequestException('Introduce un texto para buscar');
      const category = await tx.category.findFirst({ where: { id: dto.categoryId, userId } });
      if (!category) throw new BadRequestException('Categoría no disponible');
      if (dto.accountId && !await tx.account.findFirst({ where: { id: dto.accountId, userId } })) throw new BadRequestException('Cuenta no disponible');
      const data = { ...dto, name: dto.name.trim(), pattern: dto.pattern.trim(), accountId: dto.accountId || null, userId };
      return id ? tx.categorizationRule.update({ where: { id }, data }) : tx.categorizationRule.create({ data });
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.categorizationRule.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundException('Regla no encontrada');
  }

  async test(userId: string, dto: TestRuleDto) {
    if (!await this.prisma.account.findFirst({ where: { id: dto.accountId, userId } })) throw new NotFoundException('Cuenta no encontrada');
    const rule = matchRule(await this.list(userId), dto, dto.accountId);
    return { categoryId: rule?.categoryId ?? null, categoryName: rule?.category.name ?? null, matchedRule: rule ? { id: rule.id, name: rule.name } : null };
  }
}
