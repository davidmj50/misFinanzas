import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render pone un proxy delante: confiamos solo en el primer salto para que el
  // rate limiting use la IP real del cliente sin permitir falsificarla con X-Forwarded-For.
  app.set('trust proxy', 1);
  app.use(helmet());

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',');
  app.enableCors({ origin: allowedOrigins, credentials: true });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
