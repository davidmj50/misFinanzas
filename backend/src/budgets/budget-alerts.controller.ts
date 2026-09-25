import { Controller, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../recurring-payments/cron-secret.guard.js';
import { BudgetsService } from './budgets.service.js';

@Controller('budgets-alerts')
export class BudgetAlertsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post('run')
  @UseGuards(CronSecretGuard)
  run() {
    return this.budgetsService.checkAndSendAlerts();
  }
}
