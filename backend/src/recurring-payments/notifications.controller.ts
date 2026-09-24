import { Controller, Post, UseGuards } from '@nestjs/common';
import { CronSecretGuard } from './cron-secret.guard.js';
import { RecurringPaymentsService } from './recurring-payments.service.js';

@Controller('recurring-payments-notifications')
export class NotificationsController {
  constructor(private readonly recurringPaymentsService: RecurringPaymentsService) {}

  @Post('run')
  @UseGuards(CronSecretGuard)
  run() {
    return this.recurringPaymentsService.checkAndSendReminders();
  }
}
