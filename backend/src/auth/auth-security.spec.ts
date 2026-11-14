import type { EmailService } from '../email/email.service.js';
import { AccountSecurityController } from './account-security.controller.js';
import {
  newAuthToken,
  hashAuthToken,
  trustedFrontendUrl,
  validNewPassword,
} from './security-utils.js';
import {
  ForbiddenException,
  HttpStatus,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
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
      imports: [
        PassportModule.register({}),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
      ],
      controllers: [AuthController],
      providers: [
        LocalStrategy,
        {
          provide: AuthService,
          useValue: { validateUser: () => Promise.resolve(null) },
        },
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
    const credentials = {
      email: 'alguien@example.com',
      password: 'incorrecta',
    };
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(credentials)
        .expect(HttpStatus.UNAUTHORIZED);
    }
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(HttpStatus.TOO_MANY_REQUESTS);
  });
});

describe('Límites de solicitudes de recuperación', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])],
      controllers: [AccountSecurityController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            requestPasswordReset: () => ({ message: 'genérico' }),
            resetPassword: () => ({ message: 'genérico' }),
            verifyEmail: () => ({ message: 'genérico' }),
          },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it.each([
    ['password/forgot', 3],
    ['password/reset', 5],
    ['email/verify', 10],
  ])(
    'limita %s sin ejecutar el servicio adicionalmente',
    async (path, limit) => {
      for (let i = 0; i < Number(limit); i++)
        await request(app.getHttpServer())
          .post('/auth/' + path)
          .send({})
          .expect(200);
      await request(app.getHttpServer())
        .post('/auth/' + path)
        .send({})
        .expect(429);
    },
  );
});

describe('Credenciales y enlaces de seguridad', () => {
  it('rechaza dominios no seguros, fragmentos y credenciales en FRONTEND_URL', () => {
    for (const url of [
      'http://evil.example',
      'https://name:pass@example.com',
      'https://example.com/#token',
      'https://example.com/?token=x',
      'javascript:alert(1)',
    ])
      expect(trustedFrontendUrl(configWith({ FRONTEND_URL: url }))).toBeNull();
    expect(
      trustedFrontendUrl(configWith({ FRONTEND_URL: 'https://example.com' }))
        ?.origin,
    ).toBe('https://example.com');
    expect(
      trustedFrontendUrl(configWith({ FRONTEND_URL: 'http://localhost:4200' }))
        ?.origin,
    ).toBe('http://localhost:4200');
  });
  it('genera secretos aleatorios y almacena una huella irreversible', () => {
    const first = newAuthToken(),
      second = newAuthToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashAuthToken(first)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('evita contraseñas truncadas por bcrypt y cuenta caracteres Unicode', () => {
    expect(validNewPassword('🔑'.repeat(15))).toBe(true);
    expect(validNewPassword('🔑'.repeat(19))).toBe(false);
    expect(validNewPassword('a'.repeat(73))).toBe(false);
    expect(validNewPassword(null)).toBe(false);
  });
});

describe('Registro deshabilitable', () => {
  const dto = {
    email: 'nuevo@example.com',
    password: 'una frase de prueba segura',
    name: 'Nuevo',
  };

  it('rechaza el registro si ALLOW_REGISTRATION=false', async () => {
    const prisma = { user: { findUnique: vi.fn(), create: vi.fn() } };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      {} as JwtService,
      configWith({ ALLOW_REGISTRATION: 'false' }),
      {} as EmailService,
    );

    await expect(service.register(dto)).rejects.toThrow(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('JwtStrategy', () => {
  const payload = {
    sub: 'u1',
    sid: '00000000-0000-4000-8000-000000000001',
    email: 'a@example.com',
    role: 'ADMIN' as const,
  };

  it('usa el rol actual de la base de datos, no el del token', async () => {
    const prisma = {
      accountSession: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: payload.sid,
            authVersion: 0,
            lastSeenAt: new Date(),
            user: {
              id: 'u1',
              email: 'a@example.com',
              role: 'USER',
              authVersion: 0,
            },
          }),
        ),
      },
    };
    const strategy = new JwtStrategy(
      configWith({ JWT_SECRET: 's' }),
      prisma as unknown as PrismaService,
    );

    await expect(strategy.validate(payload)).resolves.toEqual({
      userId: 'u1',
      email: 'a@example.com',
      role: 'USER',
      sessionId: payload.sid,
    });
  });

  it('rechaza el token de un usuario eliminado', async () => {
    const prisma = {
      accountSession: { findFirst: vi.fn(() => Promise.resolve(null)) },
    };
    const strategy = new JwtStrategy(
      configWith({ JWT_SECRET: 's' }),
      prisma as unknown as PrismaService,
    );

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});

describe('CronSecretGuard', () => {
  const contextWith = (headers: Record<string, unknown>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

  it('acepta el secreto correcto', () => {
    const guard = new CronSecretGuard(
      configWith({ CRON_SECRET: 'secreto-largo' }),
    );
    expect(
      guard.canActivate(contextWith({ 'x-cron-secret': 'secreto-largo' })),
    ).toBe(true);
  });

  it.each([
    ['incorrecto', { 'x-cron-secret': 'secreto-larg0' }],
    ['ausente', {}],
    ['con otra longitud', { 'x-cron-secret': 'x' }],
  ])('rechaza un secreto %s', (_label, headers) => {
    const guard = new CronSecretGuard(
      configWith({ CRON_SECRET: 'secreto-largo' }),
    );
    expect(() => guard.canActivate(contextWith(headers))).toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza todo si CRON_SECRET no está configurado', () => {
    const guard = new CronSecretGuard(configWith({}));
    expect(() =>
      guard.canActivate(contextWith({ 'x-cron-secret': '' })),
    ).toThrow(UnauthorizedException);
  });
});

describe('escapeHtml', () => {
  it('escapa los caracteres especiales de HTML', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });
});
