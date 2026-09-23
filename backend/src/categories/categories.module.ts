import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
