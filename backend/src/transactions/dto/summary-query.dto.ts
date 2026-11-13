import { IsDateString, IsOptional, Matches } from 'class-validator';

export class SummaryQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}
