import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateRecurringPaymentDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
