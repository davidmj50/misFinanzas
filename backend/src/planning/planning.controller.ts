import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { CardPaymentDto, CardProfileDto, CardStatementDto, ProjectionDto, RecordRecurringDto } from './planning.dto.js';
import { PlanningService } from './planning.service.js';
@Controller('planning')
@UseGuards(JwtAuthGuard)
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}
  @Get('cards') cards(@CurrentUser() u: AuthenticatedUser) { return this.planning.cards(u.userId); }
  @Put('cards/:id') configure(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CardProfileDto) { return this.planning.configure(u.userId, id, dto); }
  @Post('statements') create(@CurrentUser() u: AuthenticatedUser, @Body() dto: CardStatementDto) { return this.planning.saveStatement(u.userId, dto); }
  @Put('statements/:id') update(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CardStatementDto) { return this.planning.saveStatement(u.userId, dto, id); }
  @Delete('statements/:id') @HttpCode(204) remove(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.planning.removeStatement(u.userId, id); }
  @Post('statements/:id/pay') pay(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CardPaymentDto) { return this.planning.pay(u.userId, id, dto); }
  @Post('recurring/:id/record') record(@CurrentUser() u: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordRecurringDto) { return this.planning.recordRecurring(u.userId, id, dto); }
  @Get('projection') projection(@CurrentUser() u: AuthenticatedUser, @Query() dto: ProjectionDto) { return this.planning.projection(u.userId, dto); }
}
