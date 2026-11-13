import { RuleField, RuleOperator, TransactionType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class SaveRuleDto {
  @IsString() @MaxLength(100) @Matches(/\S/) name!: string;
  @IsString() @MaxLength(200) @Matches(/[\p{L}\p{N}\p{P}\p{S}]/u) pattern!: string;
  @IsEnum(RuleField) field!: RuleField;
  @IsEnum(RuleOperator) operator!: RuleOperator;
  @IsInt() @Min(0) @Max(9999) priority!: number;
  @IsBoolean() active!: boolean;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() accountId?: string | null;
}

export class TestRuleDto {
  @IsUUID() accountId!: string;
  @IsEnum(TransactionType) type!: TransactionType;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(200) merchant?: string;
}
