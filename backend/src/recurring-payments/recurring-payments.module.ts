import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { RecurringPaymentsController } from './recurring-payments.controller.js';
import { RecurringPaymentsService } from './recurring-payments.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [RecurringPaymentsController],
  providers: [RecurringPaymentsService],
})
export class RecurringPaymentsModule {}
