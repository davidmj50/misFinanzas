import { randomBytes, createHash } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_BYTES = 72;
export const validNewPassword = (value: unknown): value is string =>
  typeof value === 'string' &&
  Array.from(value).length >= PASSWORD_MIN_LENGTH &&
  Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES &&
  !value.includes('\0');
export const hashAuthToken = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const newAuthToken = () => randomBytes(32).toString('base64url');
export const sessionTtlSeconds = (config: ConfigService) => {
  const value = Number(config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? 604800);
  if (!Number.isInteger(value) || value < 60 || value > 2592000)
    throw new Error('JWT_EXPIRES_IN_SECONDS debe estar entre 60 y 2592000.');
  return value;
};
export const lockUser = async (tx: Prisma.TransactionClient, id: string) => {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  return tx.user.findUnique({ where: { id } });
};
export const lockEmail = (tx: Prisma.TransactionClient, email: string) =>
  tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`identity:${email.toLowerCase()}`}))::text`;
export function trustedFrontendUrl(config: ConfigService): URL | null {
  try {
    const raw = config.get<string>('FRONTEND_URL');
    if (!raw) return null;
    const url = new URL(raw);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ))
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
export function deviceLabel(agent?: string): string {
  const value = (agent ?? '').slice(0, 500);
  const browser = /Edg\//.test(value)
    ? 'Microsoft Edge'
    : /OPR\//.test(value)
      ? 'Opera'
      : /Chrome\//.test(value)
        ? 'Chrome'
        : /Firefox\//.test(value)
          ? 'Firefox'
          : /Safari\//.test(value)
            ? 'Safari'
            : 'Navegador';
  const os = /Android/.test(value)
    ? 'Android'
    : /iPhone|iPad/.test(value)
      ? 'iPhone o iPad'
      : /Windows/.test(value)
        ? 'Windows'
        : /Macintosh/.test(value)
          ? 'macOS'
          : /Linux/.test(value)
            ? 'Linux'
            : '';
  return os ? `${browser} en ${os}` : browser;
}
