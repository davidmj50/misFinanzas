import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
