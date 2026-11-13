import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TransactionType } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';

// Respondemos 404 (y no 403) para no revelar si el recurso existe y pertenece a otro usuario.

export async function assertAccountOwned(prisma: PrismaService, userId: string, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true, currency: true } });
  if (!account) throw new NotFoundException('Cuenta no encontrada');
  return account;
}

export async function assertCategoryOwned(prisma: PrismaService, userId: string, categoryId: string, type?: TransactionType) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true, type: true, parentId: true } });
  if (!category) throw new NotFoundException('Categoría no encontrada');
  if (type && category.type !== type) throw new BadRequestException('La categoría debe tener el mismo tipo que el movimiento');
  return category;
}
