import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  AuthGuard,
  OptionalAuthGuard,
  type AuthenticatedUser,
} from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { LimitQueryDto } from './dto/limit-query.dto.js';
import { FeedService } from './feed.service.js';

const DEFAULT_TREND_COUNT = 10;
const DEFAULT_SUGGESTION_COUNT = 3;

@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  /** The "Discover" tab of the front. */
  @Get('discover')
  @UseGuards(OptionalAuthGuard)
  discover(
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.feed.discover(query, viewer?.id);
  }

  /** The "My network" tab of the front. */
  @Get('network')
  @UseGuards(AuthGuard)
  network(
    @Query() query: PaginationQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.feed.network(query, currentUser.id);
  }

  @Get('who-to-follow')
  @UseGuards(OptionalAuthGuard)
  whoToFollow(
    @Query() query: LimitQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.feed.whoToFollow(
      query.limit ?? DEFAULT_SUGGESTION_COUNT,
      viewer?.id,
    );
  }
}

@Controller('hashtags')
export class HashtagsController {
  constructor(private readonly feed: FeedService) {}

  @Get('trending')
  trending(@Query() query: LimitQueryDto) {
    return this.feed.trending(query.limit ?? DEFAULT_TREND_COUNT);
  }

  /** `tag` goes without the `#`. */
  @Get(':tag/posts')
  @UseGuards(OptionalAuthGuard)
  listPosts(
    @Param('tag') tag: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.feed.byHashtag(tag, query, viewer?.id);
  }
}

@Controller('users/:handle/posts')
export class UserPostsController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(
    @Param('handle') handle: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.feed.byUser(handle, query, viewer?.id);
  }
}
