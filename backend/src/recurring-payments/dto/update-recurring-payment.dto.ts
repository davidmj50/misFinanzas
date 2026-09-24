import { PartialType } from '@nestjs/mapped-types';
import { CreateRecurringPaymentDto } from './create-recurring-payment.dto.js';

export class UpdateRecurringPaymentDto extends PartialType(CreateRecurringPaymentDto) {}
