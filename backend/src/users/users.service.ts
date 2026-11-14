import { lockEmail, lockUser } from '../auth/security-utils.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

const SALT_ROUNDS = 12;

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    return this.prisma.$transaction(async (tx) => {
      await lockEmail(tx, dto.email);
      if (
        await tx.user.findFirst({
          where: { email: { equals: dto.email, mode: 'insensitive' } },
        })
      )
        throw new ConflictException('Ya existe una cuenta con ese correo');
      return tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: dto.role,
        },
        select: SAFE_USER_SELECT,
      });
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      select: SAFE_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const { password, ...rest } = dto;
    const passwordHash = password
      ? await bcrypt.hash(password, SALT_ROUNDS)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      if (dto.email) await lockEmail(tx, dto.email);
      const existing = await lockUser(tx, id);
      if (!existing) throw new NotFoundException('Usuario no encontrado');
      if (
        dto.email &&
        (await tx.user.findFirst({
          where: {
            id: { not: id },
            email: { equals: dto.email, mode: 'insensitive' },
          },
        }))
      )
        throw new ConflictException('Ya existe una cuenta con ese correo');
      const emailChanged =
        dto.email !== undefined && dto.email !== existing.email;
      const sensitive = emailChanged || !!passwordHash;
      const user = await tx.user.update({
        where: { id },
        data: {
          ...rest,
          ...(passwordHash ? { passwordHash } : {}),
          ...(sensitive ? { authVersion: { increment: 1 } } : {}),
          ...(emailChanged ? { emailVerifiedAt: null } : {}),
        },
        select: SAFE_USER_SELECT,
      });
      if (sensitive) {
        await tx.accountSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.authLink.deleteMany({ where: { userId: id } });
      }
      return user;
    });
  }

  async remove(currentUserId: string, id: string) {
    await this.findOne(id);
    if (id === currentUserId) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta');
    }
    await this.prisma.user.delete({ where: { id } });
  }
}
