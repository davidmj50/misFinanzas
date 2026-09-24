import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/decorators/current-user.decorator.js';
import { RecurringPaymentsService } from './recurring-payments.service.js';
import { CreateRecurringPaymentDto } from './dto/create-recurring-payment.dto.js';
import { UpdateRecurringPaymentDto } from './dto/update-recurring-payment.dto.js';

@Controller('recurring-payments')
@UseGuards(JwtAuthGuard)
export class RecurringPaymentsController {
  constructor(private readonly recurringPaymentsService: RecurringPaymentsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRecurringPaymentDto) {
    return this.recurringPaymentsService.create(user.userId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.recurringPaymentsService.findAll(user.userId);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateRecurringPaymentDto) {
    return this.recurringPaymentsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.recurringPaymentsService.remove(user.userId, id);
  }
}
