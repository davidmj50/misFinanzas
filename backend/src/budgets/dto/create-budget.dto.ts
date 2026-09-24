import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateBudgetDto {
  @IsUUID()
  categoryId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}
