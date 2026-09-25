import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

// Respondemos 404 (y no 403) para no revelar si el recurso existe y pertenece a otro usuario.

export async function assertAccountOwned(prisma: PrismaService, userId: string, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) throw new NotFoundException('Cuenta no encontrada');
}

export async function assertCategoryOwned(prisma: PrismaService, userId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!category) throw new NotFoundException('Categoría no encontrada');
}
