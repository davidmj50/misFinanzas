import { BadRequestException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, validateSync } from 'class-validator';
export class UploadDocumentsDto { @IsUUID() requestId!: string; }
export class CreateDocumentExpenseDto extends UploadDocumentsDto {
  @IsUUID() accountId!: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999999999.99) amount!: number;
  @IsOptional() @IsString() @MaxLength(200) merchant?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export function parseMetadata<T extends object>(type: ClassConstructor<T>, value: unknown): T {
  let parsed: unknown;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : null; } catch { throw new BadRequestException('Los datos del comprobante no son válidos'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException('Faltan los datos del gasto o la clave de envío');
  const dto = plainToInstance(type, parsed);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw new BadRequestException(errors.flatMap(e => Object.values(e.constraints ?? {})));
  return dto;
}
