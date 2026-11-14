import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { NewPassword } from '../../auth/dto/account-security.dto.js';
export class UpdateUserDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(UserRole)
  role?: UserRole;
  @ValidateIf((_object, value) => value !== undefined)
  @NewPassword()
  password?: string;
}
