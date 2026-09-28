import { IsOptional, IsUUID } from 'class-validator';

export class QueryTransferDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
