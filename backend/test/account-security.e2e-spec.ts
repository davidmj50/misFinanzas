import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { AuthModule } from '../src/auth/auth.module.js';
import { UsersModule } from '../src/users/users.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { EmailService } from '../src/email/email.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { hashAuthToken } from '../src/auth/security-utils.js';
import { UsersService } from '../src/users/users.service.js';

describe.runIf(process.env.RUN_ACCOUNT_SECURITY_DB_TESTS === 'true')(
  'Cuenta y seguridad: API y PostgreSQL',
  () => {
    let app: INestApplication, prisma: PrismaService, auth: AuthService;
    let id: string, otherId: string, token: string, sid: string;
    const ids: string[] = [];
    const password = 'mi frase de prueba 2026';
    const replacement = 'otra frase segura 2026';
    const mailbox: { to: string; html: string; subject: string }[] = [];
    let configured = true,
      delivery = true;
    const api = () => request(app.getHttpServer());
    const bearer = (value = token) => ({ Authorization: `Bearer ${value}` });
    const post = (path: string, data: object, value = token) =>
      api()
        .post('/api/auth/' + path)
        .set(bearer(value))
        .send(data);
    async function issue(
      purpose: 'RESET_PASSWORD' | 'VERIFY_EMAIL' = 'RESET_PASSWORD',
    ) {
      mailbox.length = 0;
      if (purpose === 'RESET_PASSWORD')
        await post('password/forgot', {
          email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
        }).expect(200);
      else await post('email/resend', {}).expect(200);
      for (
        let i = 0;
        i < 100 && !mailbox.some((item) => item.html.includes('?token='));
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
      const mail = mailbox.find((item) => item.html.includes('?token='));
      if (!mail) throw new Error('Falta el correo de prueba');
      const link = /href="([^"]+)"/
        .exec(mail.html)![1]
        .replaceAll('&amp;', '&');
      return {
        value: new URLSearchParams(new URL(link).hash.split('?')[1]).get(
          'token',
        )!,
        link,
      };
    }
    async function anotherSession(userId = id) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      return auth.login(user, 'Mozilla/5.0 Firefox/120.0 Windows');
    }
    beforeAll(async () => {
      if (
        !['localhost', '127.0.0.1', 'postgres'].includes(
          new URL(process.env.DATABASE_URL ?? '').hostname,
        )
      )
        throw new Error('Estas pruebas solo usan una base local.');
      process.env.FRONTEND_URL = 'https://misfinanzas.example.test';
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          PrismaModule,
          AuthModule,
          UsersModule,
        ],
      })
        .overrideProvider(EmailService)
        .useValue({
          isConfigured: () => configured,
          send: (to: string, subject: string, html: string) => {
            mailbox.push({ to, subject, html });
            return Promise.resolve(delivery);
          },
        })
        .compile();
      app = module.createNestApplication();
      app.useLogger(false);
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      prisma = app.get(PrismaService);
      auth = app.get(AuthService);
    });
    beforeEach(async () => {
      configured = true;
      delivery = true;
      mailbox.length = 0;
      id = randomUUID();
      otherId = randomUUID();
      ids.push(id, otherId);
      await prisma.user.createMany({
        data: [id, otherId].map((value) => ({
          id: value,
          email: `${value}@security.test`,
          name: 'Persona de prueba',
          passwordHash: bcrypt.hashSync(password, 4),
        })),
      });
      const session = await anotherSession();
      token = session.accessToken;
      sid = session.sessionId;
    });
    afterAll(async () => {
      try {
        if (prisma)
          await prisma.user.deleteMany({ where: { id: { in: ids } } });
      } finally {
        if (app) await app.close();
      }
    });
    it('exige autenticación para ver, modificar y cerrar sesiones', async () => {
      await api().get('/api/auth/security').expect(401);
      for (const path of [
        'password/change',
        'email/resend',
        'sessions/revoke-others',
        'logout',
      ])
        await api()
          .post('/api/auth/' + path)
          .send({})
          .expect(401);
      await api()
        .delete('/api/auth/sessions/' + sid)
        .expect(401);
    });
    it('crea una cuenta y sesión sin exponer credenciales y permite contraseñas heredadas al ingresar', async () => {
      const email = `${randomUUID()}@security.test`;
      const result = await post('register', {
        email,
        password,
        name: 'Cuenta nueva',
      }).expect(201);
      ids.push(result.body.user.id);
      expect(result.body.user).toMatchObject({ email, emailVerifiedAt: null });
      expect(result.body.user.passwordHash).toBeUndefined();
      expect(result.headers['cache-control']).toContain('no-store');
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash('legacy12', 4) },
      });
      await post('login', {
        email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
        password: 'legacy12',
      }).expect(200);
      for (
        let i = 0;
        i < 100 &&
        !(await prisma.authLink.findFirst({
          where: { userId: result.body.user.id },
        }));
        i++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
    });
    it('valida longitud, Unicode, bytes, nulos y campos desconocidos en contraseñas nuevas', async () => {
      for (const value of [
        '12345678',
        'a'.repeat(73),
        '🔑'.repeat(19),
        'un secreto con\0nulo',
      ])
        await post('password/change', {
          currentPassword: password,
          newPassword: value,
        }).expect(400);
      await post('password/change', {
        currentPassword: password,
        newPassword: replacement,
        role: 'ADMIN',
      }).expect(400);
      await post('password/change', {
        currentPassword: password,
        newPassword: '🔑'.repeat(15),
      }).expect(200);
    });
    it('rechaza duplicados de correo con otra capitalización', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      await post('register', {
        email: user.email.toUpperCase(),
        password,
        name: 'Duplicado',
      }).expect(409);
    });
    it('devuelve el mismo mensaje para correos existentes y desconocidos', async () => {
      const known = await post('password/forgot', {
        email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
      }).expect(200);
      const unknown = await post('password/forgot', {
        email: 'ausente@security.test',
      }).expect(200);
      expect(known.body).toEqual(unknown.body);
      expect(Object.keys(known.body)).toEqual(['message']);
    });
    it('guarda solo el hash y construye enlaces con el dominio configurado', async () => {
      const link = await issue();
      const saved = await prisma.authLink.findUniqueOrThrow({
        where: { tokenHash: hashAuthToken(link.value) },
      });
      expect(saved.tokenHash).not.toBe(link.value);
      expect(link.value).toMatch(/^[\w-]{43}$/);
      expect(
        link.link.startsWith(
          'https://misfinanzas.example.test/#/authentication/reset-password?token=',
        ),
      ).toBe(true);
      expect(saved.expiresAt.getTime() - Date.now()).toBeGreaterThan(
        29 * 60000,
      );
    });
    it('verifica el correo una sola vez y rechaza usar el enlace con otro propósito', async () => {
      const link = await issue('VERIFY_EMAIL');
      await post('password/reset', {
        token: link.value,
        newPassword: replacement,
      }).expect(400);
      await post('email/verify', { token: link.value }).expect(200);
      await post('email/verify', { token: link.value }).expect(400);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id } }))
          .emailVerifiedAt,
      ).not.toBeNull();
      await api().get('/api/auth/me').set(bearer()).expect(200);
    });
    it('rechaza enlaces vencidos, inválidos y alterados sin cambiar la contraseña', async () => {
      const link = await issue();
      await prisma.authLink.updateMany({
        where: { userId: id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await post('password/reset', {
        token: link.value,
        newPassword: replacement,
      }).expect(400);
      await post('password/reset', {
        token: 'x'.repeat(43),
        newPassword: replacement,
      }).expect(400);
      await post('password/reset', {
        token: 'corto',
        newPassword: replacement,
      }).expect(400);
      expect(
        await bcrypt.compare(
          password,
          (await prisma.user.findUniqueOrThrow({ where: { id } })).passwordHash,
        ),
      ).toBe(true);
    });
    it('recupera la contraseña, verifica el correo y revoca todos los dispositivos y enlaces', async () => {
      const second = await anotherSession();
      const verify = await issue('VERIFY_EMAIL');
      const reset = await issue();
      await post('password/reset', {
        token: reset.value,
        newPassword: replacement,
      }).expect(200);
      await api().get('/api/auth/me').set(bearer()).expect(401);
      await api()
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(401);
      await post('password/reset', {
        token: reset.value,
        newPassword: replacement,
      }).expect(400);
      await post('email/verify', { token: verify.value }).expect(400);
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user.emailVerifiedAt).not.toBeNull();
      await post('login', { email: user.email, password }).expect(401);
      const login = await post('login', {
        email: user.email,
        password: replacement,
      }).expect(200);
      await api()
        .get('/api/auth/me')
        .set(bearer(login.body.accessToken))
        .expect(200);
    });
    it('solo permite un consumo si se envía el mismo enlace simultáneamente', async () => {
      const link = await issue();
      const results = await Promise.all([
        post('password/reset', { token: link.value, newPassword: replacement }),
        post('password/reset', { token: link.value, newPassword: replacement }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    });
    it('limita los reenvíos y sustituye enlaces anteriores', async () => {
      const first = await issue();
      mailbox.length = 0;
      await post('password/forgot', {
        email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
      }).expect(200);
      expect(mailbox).toHaveLength(0);
      await prisma.authLink.updateMany({
        where: { userId: id },
        data: { issuedAt: new Date(Date.now() - 61000) },
      });
      const second = await issue();
      expect(second.value).not.toBe(first.value);
      await post('password/reset', {
        token: first.value,
        newPassword: replacement,
      }).expect(400);
      await prisma.authLink.updateMany({
        where: { userId: id },
        data: { issuedAt: new Date(Date.now() - 61000), sentInWindow: 3 },
      });
      mailbox.length = 0;
      await post('password/forgot', {
        email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
      }).expect(200);
      expect(mailbox).toHaveLength(0);
    });
    it('exige contraseña actual y una nueva diferente sin cerrar sesión por un error', async () => {
      await post('password/change', {
        currentPassword: 'incorrecta',
        newPassword: replacement,
      }).expect(400);
      await post('password/change', {
        currentPassword: password,
        newPassword: password,
      }).expect(400);
      await api().get('/api/auth/me').set(bearer()).expect(200);
    });
    it('cambiar contraseña revoca todas las sesiones y enlaces pendientes', async () => {
      const second = await anotherSession();
      const link = await issue();
      await post('password/change', {
        currentPassword: password,
        newPassword: replacement,
      }).expect(200);
      await api().get('/api/auth/me').set(bearer()).expect(401);
      await api()
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(401);
      await post('password/reset', {
        token: link.value,
        newPassword: password,
      }).expect(400);
    });
    it('solo muestra las sesiones activas propias e identifica la actual', async () => {
      const second = await anotherSession();
      await anotherSession(otherId);
      const result = await api()
        .get('/api/auth/security')
        .set(bearer())
        .expect(200);
      expect(result.body.sessions).toHaveLength(2);
      expect(
        result.body.sessions.find((item: { id: string }) => item.id === sid)
          .current,
      ).toBe(true);
      expect(
        result.body.sessions.find(
          (item: { id: string }) => item.id === second.sessionId,
        ).current,
      ).toBe(false);
      expect(result.headers['cache-control']).toContain('no-store');
      expect(JSON.stringify(result.body)).not.toMatch(
        /passwordHash|authVersion|tokenHash|accessToken/,
      );
    });
    it('no permite cerrar una sesión ajena ni aceptar identificadores arbitrarios', async () => {
      const other = await anotherSession(otherId);
      await api()
        .delete('/api/auth/sessions/' + other.sessionId)
        .set(bearer())
        .expect(400);
      await api()
        .delete('/api/auth/sessions/incorrecto')
        .set(bearer())
        .expect(400);
      await api()
        .get('/api/auth/me')
        .set(bearer(other.accessToken))
        .expect(200);
    });
    it('revoca un dispositivo individual de forma efectiva', async () => {
      const second = await anotherSession();
      await api()
        .delete('/api/auth/sessions/' + second.sessionId)
        .set(bearer())
        .expect(200);
      await api()
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(401);
      await api().get('/api/auth/me').set(bearer()).expect(200);
    });
    it('cierra todas las otras sesiones con contraseña y conserva la actual', async () => {
      const second = await anotherSession();
      await post('sessions/revoke-others', {
        currentPassword: 'incorrecta',
      }).expect(400);
      await api()
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(200);
      await post('sessions/revoke-others', {
        currentPassword: password,
      }).expect(200);
      await api()
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(401);
      await api().get('/api/auth/me').set(bearer()).expect(200);
    });
    it('cerrar sesión en el servidor invalida el token conservado', async () => {
      await post('logout', {}).expect(204);
      await api().get('/api/auth/me').set(bearer()).expect(401);
    });
    it('rechaza tokens anteriores sin sesión, vencidos y con versión de acceso antigua', async () => {
      const legacy = app.get(JwtService).sign({ sub: id });
      await api().get('/api/auth/me').set(bearer(legacy)).expect(401);
      await prisma.accountSession.update({
        where: { id: sid },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await api().get('/api/auth/me').set(bearer()).expect(401);
      const second = await anotherSession();
      await prisma.user.update({
        where: { id },
        data: { authVersion: { increment: 1 } },
      });
      await api()
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(401);
    });
    it('limita las sesiones activas y revoca la más antigua', async () => {
      for (let i = 0; i < 20; i++) await anotherSession();
      expect(
        await prisma.accountSession.count({
          where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
        }),
      ).toBe(20);
      await api().get('/api/auth/me').set(bearer()).expect(401);
    });
    it('una edición administrativa de correo invalida accesos y verificaciones', async () => {
      const link = await issue('VERIFY_EMAIL');
      await app
        .get(UsersService)
        .update(id, { email: `${randomUUID()}@security.test` });
      await api().get('/api/auth/me').set(bearer()).expect(401);
      await post('email/verify', { token: link.value }).expect(400);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id } }))
          .emailVerifiedAt,
      ).toBeNull();
    });
    it('no permite que una validación de contraseña anterior al cambio cree una sesión', async () => {
      const validated = await prisma.user.findUniqueOrThrow({ where: { id } });
      await app.get(UsersService).update(id, { password: replacement });
      await expect(auth.login(validated)).rejects.toThrow();
    });
    it('informa indisponibilidad del correo sin revelar si la cuenta existe', async () => {
      configured = false;
      const known = await post('password/forgot', {
        email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
      }).expect(503);
      const unknown = await post('password/forgot', {
        email: 'nadie@security.test',
      }).expect(503);
      expect(known.body).toEqual(unknown.body);
      await api()
        .get('/api/auth/security')
        .set(bearer())
        .expect(200)
        .expect((result) =>
          expect(result.body.emailDeliveryAvailable).toBe(false),
        );
    });
    it('los fallos del proveedor no revelan cuentas en recuperación y se indican en reenvío autenticado', async () => {
      delivery = false;
      await post('password/forgot', {
        email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
      }).expect(200);
      await post('email/resend', {}).expect(503);
    });
  },
);
