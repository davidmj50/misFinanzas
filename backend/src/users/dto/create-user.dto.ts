import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';
import {
  EmailRequestDto,
  NewPassword,
} from '../../auth/dto/account-security.dto.js';
export class CreateUserDto extends EmailRequestDto {
  @NewPassword()
  password!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
