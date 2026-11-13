import { QuickEntriesModule } from './quick-entries/quick-entries.module.js';
import { ExpenseDocumentsModule } from './expense-documents/expense-documents.module.js';
import { PlanningModule } from './planning/planning.module.js';
import { CategorizationRulesModule } from './categorization-rules/categorization-rules.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { TransfersModule } from './transfers/transfers.module.js';
import { ImportsModule } from './imports/imports.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
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
    TransfersModule,
    ImportsModule,
    QuickEntriesModule,
    ExpenseDocumentsModule,
    PlanningModule,
    CategorizationRulesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
