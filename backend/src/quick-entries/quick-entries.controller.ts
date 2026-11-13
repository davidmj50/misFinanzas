import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { QuickEntriesService } from './quick-entries.service.js';
import { QuickEntryDto } from './quick-entry.dto.js';
@Controller('quick-entries')
@UseGuards(JwtAuthGuard)
export class QuickEntriesController {
  constructor(private readonly entries: QuickEntriesService) {}
  @Post() @Throttle({ default: { limit: 30, ttl: 60000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: QuickEntryDto) { return this.entries.create(user.userId, dto); }
}
