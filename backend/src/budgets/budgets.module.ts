import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [BudgetsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}
