import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
} from 'class-validator';
import { validNewPassword } from '../security-utils.js';

export const NewPassword = () =>
  ValidateBy({
    name: 'newPassword',
    validator: {
      validate: validNewPassword,
      defaultMessage: () =>
        'Usa una contraseña de al menos 15 caracteres; si es muy larga, acórtala.',
    },
  });
export class EmailRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class AuthTokenDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'El enlace no es válido o ya venció. Solicita uno nuevo.',
  })
  token!: string;
}
export class ResetPasswordDto extends AuthTokenDto {
  @NewPassword()
  newPassword!: string;
}
export class CurrentPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  currentPassword!: string;
}
export class ChangePasswordDto extends CurrentPasswordDto {
  @NewPassword()
  newPassword!: string;
}
