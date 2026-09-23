import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const MAX_CONNECT_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (attempt === MAX_CONNECT_ATTEMPTS) throw error;
        this.logger.warn(
          `No se pudo conectar a la base de datos (intento ${attempt}/${MAX_CONNECT_ATTEMPTS}). Reintentando en ${RETRY_DELAY_MS}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
