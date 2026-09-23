import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
