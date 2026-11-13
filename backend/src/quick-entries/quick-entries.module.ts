import { Module } from '@nestjs/common';
import { QuickEntriesController } from './quick-entries.controller.js';
import { QuickEntriesService } from './quick-entries.service.js';
@Module({ controllers: [QuickEntriesController], providers: [QuickEntriesService] })
export class QuickEntriesModule {}
