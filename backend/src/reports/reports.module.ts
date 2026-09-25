import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { MonthlySummaryController } from './monthly-summary.controller.js';
import { MonthlySummaryService } from './monthly-summary.service.js';

@Module({
  imports: [EmailModule, AccountsModule],
  controllers: [MonthlySummaryController],
  providers: [MonthlySummaryService],
})
export class ReportsModule {}
