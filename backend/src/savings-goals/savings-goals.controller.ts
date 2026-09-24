import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { SavingsGoalsService } from './savings-goals.service.js';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto.js';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto.js';
import { CreateContributionDto } from './dto/create-contribution.dto.js';

@Controller('savings-goals')
@UseGuards(JwtAuthGuard)
export class SavingsGoalsController {
  constructor(private readonly savingsGoalsService: SavingsGoalsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSavingsGoalDto) {
    return this.savingsGoalsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.savingsGoalsService.findAll(user.userId);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateSavingsGoalDto) {
    return this.savingsGoalsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.savingsGoalsService.remove(user.userId, id);
  }

  @Post(':id/contributions')
  addContribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateContributionDto,
  ) {
    return this.savingsGoalsService.addContribution(user.userId, id, dto);
  }

  @Delete(':id/contributions/:contributionId')
  removeContribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('contributionId') contributionId: string,
  ) {
    return this.savingsGoalsService.removeContribution(user.userId, id, contributionId);
  }
}
