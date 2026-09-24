import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { EmailModule } from '../email/email.module.js';
import { RecurringPaymentsController } from './recurring-payments.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { RecurringPaymentsService } from './recurring-payments.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), EmailModule],
  controllers: [RecurringPaymentsController, NotificationsController],
  providers: [RecurringPaymentsService],
})
export class RecurringPaymentsModule {}
