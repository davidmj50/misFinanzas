import { CategorizationRulesModule } from '../categorization-rules/categorization-rules.module.js';
import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({ imports: [CategorizationRulesModule], controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}
