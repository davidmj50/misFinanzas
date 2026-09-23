import { AccountType } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  initialBalance?: number;

  @IsOptional()
  @IsString()
  color?: string;
}
