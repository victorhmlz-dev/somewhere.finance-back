import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthGuard,
  OptionalAuthGuard,
  type AuthenticatedUser,
} from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { LimitPerMinute, RATE_LIMITS } from '../common/rate-limits.js';
import type { ReactionKind } from '../generated/prisma/enums.js';
import { ParseReactionKindPipe } from '../reactions/reaction-kind.pipe.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';

@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  /** Publishes a post, or a reply when `replyToId` is sent. */
  @LimitPerMinute(RATE_LIMITS.posts)
  @Post()
  @UseGuards(AuthGuard)
  create(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: CreatePostDto,
  ) {
    return this.posts.create(currentUser.id, dto);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.posts.get(id, viewer?.id);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.posts.remove(currentUser.id, id);
  }

  @Get(':id/replies')
  @UseGuards(OptionalAuthGuard)
  listReplies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.posts.listReplies(id, query, viewer?.id);
  }

  /** The four routes below return the post as the session's user now sees it. */
  @Put(':id/like')
  @UseGuards(AuthGuard)
  like(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.posts.like(currentUser.id, id);
  }

  @Delete(':id/like')
  @UseGuards(AuthGuard)
  unlike(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.posts.unlike(currentUser.id, id);
  }

  @Put(':id/repost')
  @UseGuards(AuthGuard)
  repost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.posts.repost(currentUser.id, id);
  }

  @Delete(':id/repost')
  @UseGuards(AuthGuard)
  unrepost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.posts.unrepost(currentUser.id, id);
  }

  /** Reacts with an emoji: rocket, fire, gem, eyes, joy or thumbs_down. */
  @Put(':id/reactions/:kind')
  @UseGuards(AuthGuard)
  react(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', ParseReactionKindPipe) kind: ReactionKind,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.posts.setReaction(currentUser.id, id, kind, true);
  }

  @Delete(':id/reactions/:kind')
  @UseGuards(AuthGuard)
  unreact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', ParseReactionKindPipe) kind: ReactionKind,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.posts.setReaction(currentUser.id, id, kind, false);
  }
}
