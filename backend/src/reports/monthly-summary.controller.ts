import { Controller, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from '../recurring-payments/cron-secret.guard.js';
import { MonthlySummaryService } from './monthly-summary.service.js';

@Controller('reports-monthly-summary')
export class MonthlySummaryController {
  constructor(private readonly monthlySummaryService: MonthlySummaryService) {}

  @Post('run')
  @UseGuards(CronSecretGuard)
  run() {
    return this.monthlySummaryService.run();
  }
}
