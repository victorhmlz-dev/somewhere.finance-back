import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  FeedController,
  HashtagsController,
  UserPostsController,
} from './feed.controller.js';
import { FeedService } from './feed.service.js';

@Module({
  imports: [PostsModule, UsersModule],
  controllers: [FeedController, HashtagsController, UserPostsController],
  providers: [FeedService],
})
export class FeedModule {}
