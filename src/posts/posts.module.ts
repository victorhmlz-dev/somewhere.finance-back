import { Module } from '@nestjs/common';
import { ReactionsModule } from '../reactions/reactions.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [ReactionsModule, UploadsModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
