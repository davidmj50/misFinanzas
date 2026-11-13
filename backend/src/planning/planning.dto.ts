import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class CardProfileDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) creditLimit!: number;
  @IsInt() @Min(1) @Max(31) closingDay!: number;
  @IsInt() @Min(1) @Max(31) paymentDay!: number;
  @IsOptional() @IsUUID() paymentAccountId?: string | null;
}
export class CardStatementDto {
  @IsUUID() cardAccountId!: string;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) closingDate!: string;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) plannedPaymentDate?: string | null;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99) total!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(999999999999.99) minimumPayment!: number;
}
export class CardPaymentDto {
  @IsUUID() fromAccountId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount!: number;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsUUID() requestId!: string;
}
export class ProjectionDto {
  @IsUUID() accountId!: string;
  @Type(() => Number) @IsInt() @IsIn([30, 60, 90]) days = 30;
  @IsIn(['FULL', 'MINIMUM']) paymentMode: 'FULL' | 'MINIMUM' = 'FULL';
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() includeRecurring = true;
}
export class RecordRecurringDto {
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) dueDate!: string;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount!: number;
}
