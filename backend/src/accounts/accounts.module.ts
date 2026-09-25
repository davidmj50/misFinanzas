import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
