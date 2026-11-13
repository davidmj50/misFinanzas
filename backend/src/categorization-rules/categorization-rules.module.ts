import { Module } from '@nestjs/common';
import { CategorizationRulesController } from './categorization-rules.controller.js';
import { CategorizationRulesService } from './categorization-rules.service.js';
@Module({ controllers: [CategorizationRulesController], providers: [CategorizationRulesService], exports: [CategorizationRulesService] })
export class CategorizationRulesModule {}
