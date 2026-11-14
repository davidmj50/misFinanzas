import { AuthHeadersInterceptor } from './auth-headers.interceptor.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import {
  AuthTokenDto,
  ChangePasswordDto,
  CurrentPasswordDto,
  EmailRequestDto,
  ResetPasswordDto,
} from './dto/account-security.dto.js';

@Controller('auth')
@UseInterceptors(AuthHeadersInterceptor)
export class AccountSecurityController {
  constructor(private readonly auth: AuthService) {}
  @Post('password/forgot')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  forgot(@Body() dto: EmailRequestDto) {
    return this.auth.requestPasswordReset(dto.email);
  }
  @Post('password/reset')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }
  @Post('email/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  verify(@Body() dto: AuthTokenDto) {
    return this.auth.verifyEmail(dto.token);
  }
  @Post('email/resend')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  resend(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.resendVerification(user.userId);
  }
  @Get('security')
  @UseGuards(JwtAuthGuard)
  security(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.security(user.userId, user.sessionId);
  }
  @Post('password/change')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  change(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logout(user.userId, user.sessionId);
  }
  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.revokeSession(user.userId, user.sessionId, id);
  }
  @Post('sessions/revoke-others')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  revokeOthers(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CurrentPasswordDto,
  ) {
    return this.auth.revokeOthers(
      user.userId,
      user.sessionId,
      dto.currentPassword,
    );
  }
}
