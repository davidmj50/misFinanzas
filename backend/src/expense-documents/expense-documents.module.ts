import { Module } from '@nestjs/common';
import { ExpenseDocumentsController } from './expense-documents.controller.js';
import { ExpenseDocumentsService } from './expense-documents.service.js';
@Module({ controllers: [ExpenseDocumentsController], providers: [ExpenseDocumentsService] })
export class ExpenseDocumentsModule {}
