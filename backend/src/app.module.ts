import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { UsersModule } from './users/users.module.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { RecurringPaymentsModule } from './recurring-payments/recurring-payments.module.js';
import { SavingsGoalsModule } from './savings-goals/savings-goals.module.js';
import { ReportsModule } from './reports/reports.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    UsersModule,
    BudgetsModule,
    RecurringPaymentsModule,
    SavingsGoalsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
