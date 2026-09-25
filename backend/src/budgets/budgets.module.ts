import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { EmailModule } from '../email/email.module.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetAlertsController } from './budget-alerts.controller.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), EmailModule],
  controllers: [BudgetsController, BudgetAlertsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}
