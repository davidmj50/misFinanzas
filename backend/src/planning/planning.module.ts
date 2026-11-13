import { Module } from '@nestjs/common';
import { TransfersModule } from '../transfers/transfers.module.js';
import { PlanningController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';
@Module({ imports: [TransfersModule], controllers: [PlanningController], providers: [PlanningService] })
export class PlanningModule {}
