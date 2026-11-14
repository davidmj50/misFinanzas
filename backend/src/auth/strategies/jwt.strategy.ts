import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

export interface JwtPayload {
  sub: string;
  sid?: string;
}
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(payload.sid)
    )
      throw new UnauthorizedException(
        'La sesión venció. Inicia sesión de nuevo.',
      );
    const now = new Date();
    const session = await this.prisma.accountSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: { id: true, email: true, role: true, authVersion: true },
        },
      },
    });
    if (!session || session.authVersion !== session.user.authVersion)
      throw new UnauthorizedException(
        'La sesión venció. Inicia sesión de nuevo.',
      );
    if (now.getTime() - session.lastSeenAt.getTime() >= 300000) {
      await this.prisma.accountSession.updateMany({
        where: {
          id: session.id,
          userId: session.userId,
          revokedAt: null,
          lastSeenAt: { lt: new Date(now.getTime() - 300000) },
        },
        data: { lastSeenAt: now },
      });
    }
    return {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    };
  }
}
