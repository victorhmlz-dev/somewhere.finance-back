import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { PostsController, UserPostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [UsersModule],
  controllers: [PostsController, UserPostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
