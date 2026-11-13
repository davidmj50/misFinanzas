import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { CategorizationRulesService } from './categorization-rules.service.js';
import { SaveRuleDto, TestRuleDto } from './rule.dto.js';

@Controller('categorization-rules')
@UseGuards(JwtAuthGuard)
export class CategorizationRulesController {
  constructor(private readonly rules: CategorizationRulesService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.rules.list(user.userId); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveRuleDto) { return this.rules.save(user.userId, dto); }
  @Post('test') test(@CurrentUser() user: AuthenticatedUser, @Body() dto: TestRuleDto) { return this.rules.test(user.userId, dto); }
  @Put(':id') update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveRuleDto) { return this.rules.save(user.userId, dto, id); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.rules.remove(user.userId, id); }
}
