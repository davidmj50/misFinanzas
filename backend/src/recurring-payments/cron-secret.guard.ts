import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Se comparan los hashes para que ambos buffers tengan la misma longitud y la
// comparación no revele cuántos caracteres coinciden.
function safeEqual(a: string, b: string) {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expected = this.config.get<string>('CRON_SECRET');
    const provided = request.headers['x-cron-secret'];

    if (!expected || typeof provided !== 'string' || !safeEqual(provided, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
