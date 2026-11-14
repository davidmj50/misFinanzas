import { IsString, MaxLength, MinLength } from 'class-validator';
import { EmailRequestDto } from './account-security.dto.js';
export class LoginDto extends EmailRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}
