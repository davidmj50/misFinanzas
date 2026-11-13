import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { ImportsService } from './imports.service.js';
import { CommitImportDto, PreviewImportDto } from './dto/import.dto.js';

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('preview')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  preview(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreviewImportDto) {
    return this.imports.preview(user.userId, dto);
  }

  @Post('commit')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  commit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CommitImportDto) {
    return this.imports.commit(user.userId, dto);
  }
}
