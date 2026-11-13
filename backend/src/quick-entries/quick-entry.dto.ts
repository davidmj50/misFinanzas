import { TransactionType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
export class QuickEntryDto {
  @IsUUID() requestId!: string;
  @IsUUID() accountId!: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsEnum(TransactionType) type!: TransactionType;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount!: number;
  @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional() @IsString() @MaxLength(200) merchant?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
