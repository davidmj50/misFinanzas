import { ForbiddenException, HttpStatus, type INestApplication, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { CronSecretGuard } from '../recurring-payments/cron-secret.guard.js';
import { escapeHtml } from '../email/escape-html.js';

const configWith = (values: Record<string, string>) =>
  ({
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  }) as unknown as ConfigService;

describe('Rate limiting en /auth/login', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({}), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
      controllers: [AuthController],
      providers: [
        LocalStrategy,
        { provide: AuthService, useValue: { validateUser: () => Promise.resolve(null) } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloquea con 429 tras 10 intentos fallidos', async () => {
    const credentials = { email: 'alguien@example.com', password: 'incorrecta' };
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(HttpStatus.UNAUTHORIZED);
    }
    await request(app.getHttpServer()).post('/auth/login').send(credentials).expect(HttpStatus.TOO_MANY_REQUESTS);
  });
});

describe('Registro deshabilitable', () => {
  const dto = { email: 'nuevo@example.com', password: '12345678', name: 'Nuevo' };

  it('rechaza el registro si ALLOW_REGISTRATION=false', async () => {
    const prisma = { user: { findUnique: vi.fn(), create: vi.fn() } };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      configWith({ ALLOW_REGISTRATION: 'false' }),
    );

    await expect(service.register(dto)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('permite el registro si la variable no está definida', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn(() => Promise.resolve(null)),
        create: vi.fn(() => Promise.resolve({ id: 'u1', ...dto, role: 'USER' })),
      },
    };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      { sign: () => 'token' } as unknown as JwtService,
      configWith({}),
    );

    await expect(service.register(dto)).resolves.toMatchObject({ accessToken: 'token' });
  });
});

describe('JwtStrategy', () => {
  const payload = { sub: 'u1', email: 'a@example.com', role: 'ADMIN' as const };

  it('usa el rol actual de la base de datos, no el del token', async () => {
    const prisma = {
      user: { findUnique: vi.fn(() => Promise.resolve({ id: 'u1', email: 'a@example.com', role: 'USER' })) },
    };
    const strategy = new JwtStrategy(configWith({ JWT_SECRET: 's' }), prisma as unknown as PrismaService);

    await expect(strategy.validate(payload)).resolves.toEqual({ userId: 'u1', email: 'a@example.com', role: 'USER' });
  });

  it('rechaza el token de un usuario eliminado', async () => {
    const prisma = { user: { findUnique: vi.fn(() => Promise.resolve(null)) } };
    const strategy = new JwtStrategy(configWith({ JWT_SECRET: 's' }), prisma as unknown as PrismaService);

    await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });
});

describe('CronSecretGuard', () => {
  const contextWith = (headers: Record<string, unknown>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

  it('acepta el secreto correcto', () => {
    const guard = new CronSecretGuard(configWith({ CRON_SECRET: 'secreto-largo' }));
    expect(guard.canActivate(contextWith({ 'x-cron-secret': 'secreto-largo' }))).toBe(true);
  });

  it.each([
    ['incorrecto', { 'x-cron-secret': 'secreto-larg0' }],
    ['ausente', {}],
    ['con otra longitud', { 'x-cron-secret': 'x' }],
  ])('rechaza un secreto %s', (_label, headers) => {
    const guard = new CronSecretGuard(configWith({ CRON_SECRET: 'secreto-largo' }));
    expect(() => guard.canActivate(contextWith(headers))).toThrow(UnauthorizedException);
  });

  it('rechaza todo si CRON_SECRET no está configurado', () => {
    const guard = new CronSecretGuard(configWith({}));
    expect(() => guard.canActivate(contextWith({ 'x-cron-secret': '' }))).toThrow(UnauthorizedException);
  });
});

describe('escapeHtml', () => {
  it('escapa los caracteres especiales de HTML', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });
});
