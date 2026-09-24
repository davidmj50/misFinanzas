import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateContributionDto {
  @IsNumber()
  amount!: number;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
