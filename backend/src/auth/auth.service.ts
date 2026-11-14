import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthLinkPurpose, Prisma, type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';
import { escapeHtml } from '../email/escape-html.js';
import { RegisterDto } from './dto/register.dto.js';
import {
  deviceLabel,
  hashAuthToken,
  lockEmail,
  lockUser,
  newAuthToken,
  sessionTtlSeconds,
  trustedFrontendUrl,
} from './security-utils.js';

const SALT_ROUNDS = 12;
const DUMMY_HASH =
  '$2b$12$ZjXzn.ZBru/7TbV3nwZIQO/pK5sRsn5WKGMdKYxr3W8TZLhG24IGy';
const INVALID_LINK = 'El enlace no es válido o ya venció. Solicita uno nuevo.';
const RESET_MESSAGE =
  'Si hay una cuenta con ese correo, recibirás un enlace para recuperar el acceso. Revisa también tu carpeta de spam.';
const safeUser = (user: User) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  emailVerifiedAt: user.emailVerifiedAt,
});
type IssuedLink = {
  token: string;
  email: string;
  name: string;
  purpose: AuthLinkPurpose;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async register(dto: RegisterDto, agent?: string) {
    if (this.config.get<string>('ALLOW_REGISTRATION') === 'false')
      throw new ForbiddenException(
        'El registro está deshabilitado. Pide a un administrador que te cree una cuenta.',
      );
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await lockEmail(tx, dto.email);
        if (
          await tx.user.findFirst({
            where: { email: { equals: dto.email.trim(), mode: 'insensitive' } },
          })
        )
          throw new ConflictException('Ya existe una cuenta con ese correo');
        const user = await tx.user.create({
          data: {
            email: dto.email.trim(),
            name: dto.name.trim(),
            passwordHash,
          },
        });
        return this.createSession(tx, user, agent);
      });
      if (this.mailAvailable()) this.queueVerification(result.user.id);
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Ya existe una cuenta con ese correo');
      throw error;
    }
  }

  private async findByEmail(email: string) {
    const exact = await this.prisma.user.findUnique({
      where: { email: email.trim() },
    });
    if (exact) return exact;
    const candidates = await this.prisma.user.findMany({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      take: 2,
    });
    return candidates.length === 1 ? candidates[0] : null;
  }
  async validateUser(email: string, password: string) {
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.length > 254 ||
      password.length > 1024
    )
      return null;
    const user = await this.findByEmail(email);
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    return user && valid ? user : null;
  }
  async login(validated: User, agent?: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, validated.id);
      if (
        !user ||
        user.passwordHash !== validated.passwordHash ||
        user.authVersion !== validated.authVersion
      )
        throw new UnauthorizedException(
          'Vuelve a iniciar sesión con tu contraseña actual.',
        );
      return this.createSession(tx, user, agent);
    });
  }
  private async createSession(
    tx: Prisma.TransactionClient,
    user: User,
    agent?: string,
  ) {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + sessionTtlSeconds(this.config) * 1000,
    );
    await tx.accountSession.deleteMany({
      where: {
        userId: user.id,
        OR: [
          { expiresAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
          { revokedAt: { lt: new Date(now.getTime() - 30 * 86400000) } },
        ],
      },
    });
    const recent = await tx.accountSession.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 19,
    });
    await tx.accountSession.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now },
        id: { notIn: recent.map((session) => session.id) },
      },
      data: { revokedAt: now },
    });
    const session = await tx.accountSession.create({
      data: {
        userId: user.id,
        authVersion: user.authVersion,
        label: deviceLabel(agent),
        expiresAt,
      },
    });
    const accessToken = this.jwtService.sign({ sub: user.id, sid: session.id });
    return { accessToken, user: safeUser(user), sessionId: session.id };
  }
  async me(userId: string, sessionId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { ...safeUser(user), userId, sessionId };
  }
  async security(userId: string, sessionId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const sessions = await this.prisma.accountSession.findMany({
      where: {
        userId,
        authVersion: user.authVersion,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      user: safeUser(user),
      sessions: sessions.map((session) => ({
        ...session,
        current: session.id === sessionId,
      })),
      emailDeliveryAvailable: this.mailAvailable(),
    };
  }
  async logout(userId: string, sessionId: string) {
    await this.prisma.accountSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async revokeSession(userId: string, sessionId: string, targetId: string) {
    const result = await this.prisma.accountSession.updateMany({
      where: {
        id: targetId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });
    if (!result.count)
      throw new BadRequestException(
        'La sesión ya está cerrada o no está disponible.',
      );
    return { currentSessionClosed: targetId === sessionId };
  }
  async revokeOthers(userId: string, sessionId: string, password: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      if (!user || !(await bcrypt.compare(password, user.passwordHash)))
        throw new BadRequestException('La contraseña actual no es correcta.');
      await tx.accountSession.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { message: 'Se cerraron las otras sesiones.' };
  }
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await lockUser(tx, userId);
      if (
        !existing ||
        !(await bcrypt.compare(currentPassword, existing.passwordHash))
      )
        throw new BadRequestException('La contraseña actual no es correcta.');
      if (await bcrypt.compare(newPassword, existing.passwordHash))
        throw new BadRequestException(
          'Elige una contraseña diferente de la actual.',
        );
      const updated = await tx.user.update({
        where: { id: userId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.accountSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.authLink.deleteMany({ where: { userId } });
      return updated;
    });
    this.queuePasswordNotice(user.email);
    return {
      message:
        'Contraseña actualizada. Inicia sesión de nuevo en tus dispositivos.',
    };
  }
  mailAvailable() {
    return this.email.isConfigured() && !!trustedFrontendUrl(this.config);
  }
  private requireMail() {
    if (!this.mailAvailable())
      throw new ServiceUnavailableException(
        'El envío de correos no está disponible en este momento. Inténtalo más tarde.',
      );
  }
  private async issueLink(
    userId: string,
    purpose: AuthLinkPurpose,
  ): Promise<IssuedLink | null> {
    return this.prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      if (!user || (purpose === 'VERIFY_EMAIL' && user.emailVerifiedAt))
        return null;
      const now = new Date();
      const previous = await tx.authLink.findUnique({
        where: { userId_purpose: { userId, purpose } },
      });
      const inWindow =
        previous &&
        now.getTime() - previous.windowStartedAt.getTime() < 3600000;
      if (
        previous &&
        (now.getTime() - previous.issuedAt.getTime() < 60000 ||
          (inWindow && previous.sentInWindow >= 3))
      )
        return null;
      const token = newAuthToken();
      const tokenHash = hashAuthToken(token);
      const data = {
        tokenHash,
        email: user.email,
        authVersion: user.authVersion,
        issuedAt: now,
        consumedAt: null,
        expiresAt: new Date(
          now.getTime() +
            (purpose === 'RESET_PASSWORD' ? 30 * 60000 : 24 * 3600000),
        ),
        windowStartedAt: inWindow ? previous.windowStartedAt : now,
        sentInWindow: inWindow ? previous.sentInWindow + 1 : 1,
      };
      await tx.authLink.upsert({
        where: { userId_purpose: { userId, purpose } },
        create: { userId, purpose, ...data },
        update: data,
      });
      return { token, email: user.email, name: user.name, purpose };
    });
  }
  private async deliver(link: IssuedLink) {
    const base = trustedFrontendUrl(this.config);
    if (!base) return false;
    const action =
      link.purpose === 'RESET_PASSWORD' ? 'reset-password' : 'verify-email';
    base.hash = `/authentication/${action}?token=${encodeURIComponent(link.token)}`;
    const reset = link.purpose === 'RESET_PASSWORD';
    return this.email.send(
      link.email,
      reset
        ? 'Recupera tu acceso a MisFinanzas'
        : 'Verifica tu correo en MisFinanzas',
      `<p>Hola ${escapeHtml(link.name)},</p><p>${reset ? 'Usa este enlace para elegir una nueva contraseña. Vence en 30 minutos.' : 'Confirma que este correo te pertenece. El enlace vence en 24 horas.'}</p><p><a href="${escapeHtml(base.href)}">${reset ? 'Restablecer mi contraseña' : 'Verificar mi correo'}</a></p><p>El enlace es de un solo uso. Si no solicitaste este mensaje, puedes ignorarlo.</p>`,
    );
  }
  private queueVerification(userId: string) {
    void this.issueLink(userId, AuthLinkPurpose.VERIFY_EMAIL)
      .then((link) => (link ? this.deliver(link) : false))
      .catch(() => undefined);
  }
  private queuePasswordNotice(email: string) {
    if (this.mailAvailable())
      void this.email
        .send(
          email,
          'Contraseña actualizada en MisFinanzas',
          '<p>Se actualizó la contraseña de tu cuenta y se cerraron sus sesiones anteriores.</p><p>Si no realizaste este cambio, solicita recuperar el acceso desde el inicio de sesión de MisFinanzas.</p>',
        )
        .catch(() => undefined);
  }
  async requestPasswordReset(email: string) {
    this.requireMail();
    const start = Date.now();
    const user = await this.findByEmail(email);
    const link = user
      ? await this.issueLink(user.id, AuthLinkPurpose.RESET_PASSWORD)
      : null;
    if (link) void this.deliver(link).catch(() => undefined);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 400 - (Date.now() - start))),
    );
    return { message: RESET_MESSAGE };
  }
  async resendVerification(userId: string) {
    this.requireMail();
    const link = await this.issueLink(userId, AuthLinkPurpose.VERIFY_EMAIL);
    if (link && !(await this.deliver(link)))
      throw new ServiceUnavailableException(
        'No se pudo enviar el correo. Inténtalo de nuevo más tarde.',
      );
    return {
      message:
        'Si tu correo está pendiente de verificar, recibirás un enlace. Puedes pedir hasta tres por hora y esperar un minuto entre solicitudes.',
    };
  }
  private async consumeLink<T>(
    token: string,
    purpose: AuthLinkPurpose,
    consume: (
      tx: Prisma.TransactionClient,
      user: User,
      now: Date,
    ) => Promise<T>,
  ) {
    const tokenHash = hashAuthToken(token);
    const found = await this.prisma.authLink.findUnique({
      where: { tokenHash },
    });
    if (!found) throw new BadRequestException(INVALID_LINK);
    return this.prisma.$transaction(async (tx) => {
      const user = await lockUser(tx, found.userId);
      const link = await tx.authLink.findUnique({ where: { tokenHash } });
      const now = new Date();
      if (
        !user ||
        !link ||
        link.purpose !== purpose ||
        link.consumedAt ||
        link.expiresAt <= now ||
        link.email !== user.email ||
        link.authVersion !== user.authVersion
      )
        throw new BadRequestException(INVALID_LINK);
      await tx.authLink.update({
        where: { id: link.id },
        data: { consumedAt: now },
      });
      return consume(tx, user, now);
    });
  }
  async verifyEmail(token: string) {
    await this.consumeLink(
      token,
      AuthLinkPurpose.VERIFY_EMAIL,
      (tx, user, now) =>
        tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: user.emailVerifiedAt ?? now },
        }),
    );
    return { message: 'Correo verificado. Ya puedes volver a MisFinanzas.' };
  }
  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const user = await this.consumeLink(
      token,
      AuthLinkPurpose.RESET_PASSWORD,
      async (tx, existing, now) => {
        const updated = await tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            authVersion: { increment: 1 },
            emailVerifiedAt: existing.emailVerifiedAt ?? now,
          },
        });
        await tx.accountSession.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.authLink.deleteMany({ where: { userId: existing.id } });
        return updated;
      },
    );
    this.queuePasswordNotice(user.email);
    return {
      message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
    };
  }
}
