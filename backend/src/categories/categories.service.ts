import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { assertCategoryOwned } from '../common/ownership.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCategoryDto) {
    if (dto.parentId) await assertCategoryOwned(this.prisma, userId, dto.parentId);
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
    await this.findOne(userId, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Una categoría no puede ser su propia subcategoría');
      await assertCategoryOwned(this.prisma, userId, dto.parentId);
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.category.delete({ where: { id } });
  }
}
