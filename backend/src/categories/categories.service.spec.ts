import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { CategoriesService } from './categories.service.js';

describe('Jerarquías de categorías', () => {
  const setup = () => {
    const rows = [
      { id: 'root', userId: 'owner', type: 'EXPENSE', parentId: null as string | null },
      { id: 'child', userId: 'owner', type: 'EXPENSE', parentId: 'root' },
      { id: 'salary', userId: 'owner', type: 'INCOME', parentId: null },
    ];
    const prisma = { category: {
      findUnique: vi.fn(async ({ where }) => rows.find(c => c.id === where.id)),
      findFirst: vi.fn(async ({ where }) => rows.find(c => c.id === where.id && c.userId === where.userId)),
      update: vi.fn(async ({ where, data }) => ({ ...rows.find(c => c.id === where.id), ...data })),
      create: vi.fn(),
    } };
    return { prisma, service: new CategoriesService(prisma as unknown as PrismaService) };
  };

  it('rechaza mover una categoría debajo de su descendiente', async () => {
    const { prisma, service } = setup();
    await expect(service.update('owner', 'root', { parentId: 'child' })).rejects.toThrow(BadRequestException);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('permite eliminar la relación padre con null', async () => {
    const { service } = setup();
    await expect(service.update('owner', 'child', { parentId: null })).resolves.toMatchObject({ parentId: null });
  });

  it('rechaza un padre de otro tipo', async () => {
    const { service } = setup();
    await expect(service.update('owner', 'child', { parentId: 'salary' })).rejects.toThrow(BadRequestException);
  });

  it('rechaza crear una subcategoría de tipo incompatible', async () => {
    const { prisma, service } = setup();
    await expect(service.create('owner', { name: 'Comida', type: 'EXPENSE', parentId: 'salary' })).rejects.toThrow(BadRequestException);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });
});
