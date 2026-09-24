import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expected = this.config.get<string>('CRON_SECRET');
    const provided = request.headers['x-cron-secret'];

    if (!expected || provided !== expected) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
