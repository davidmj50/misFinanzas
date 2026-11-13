import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { assertCategoryOwned } from '../common/ownership.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto) {
    if (dto.parentId) await assertCategoryOwned(this.prisma, userId, dto.parentId, dto.type);
    return this.prisma.category.create({ data: { ...dto, userId } });
  }

  findAll(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      include: { subcategories: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    if (category.userId !== userId) throw new ForbiddenException();
    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const current = await this.findOne(userId, id);
    const type = dto.type ?? current.type;
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId;
    const visited = new Set([id]);
    let ancestorId = parentId;
    while (ancestorId) {
      if (visited.has(ancestorId)) throw new BadRequestException('La categoría padre produciría un ciclo');
      visited.add(ancestorId);
      const ancestor = await assertCategoryOwned(this.prisma, userId, ancestorId, type);
      ancestorId = ancestor.parentId;
    }
    if (type !== current.type) {
      const used = await this.prisma.category.findFirst({
        where: { id, userId, OR: [
          { transactions: { some: {} } }, { subcategories: { some: {} } },
          { categorizationRules: { some: {} } }, { budgets: { some: {} } }, { recurringPayments: { some: {} } },
        ] },
        select: { id: true },
      });
      if (used) throw new BadRequestException('No puedes cambiar el tipo de una categoría que está en uso');
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.category.delete({ where: { id } });
  }
}
