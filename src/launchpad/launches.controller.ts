import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AuthGuard,
  OptionalAuthGuard,
  type AuthenticatedUser,
} from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import type { ReactionKind } from '../generated/prisma/enums.js';
import { PostsService } from '../posts/posts.service.js';
import { ParseReactionKindPipe } from '../reactions/reaction-kind.pipe.js';
import {
  LaunchDetailsDto,
  PendingLaunchDetailsDto,
} from './dto/launch-details.dto.js';
import { ListLaunchesQueryDto } from './dto/list-launches-query.dto.js';
import { LaunchesService } from './launches.service.js';

/**
 * Token launches, as read from the launchpad contracts. Creating a launch,
 * contributing, claiming and refunding are transactions the user's wallet
 * sends to the contracts; the API only shows the result.
 */
@Controller('launches')
export class LaunchesController {
  constructor(
    private readonly launches: LaunchesService,
    private readonly posts: PostsService,
  ) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(
    @Query() query: ListLaunchesQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.launches.list(query, viewer?.id);
  }

  /** The chains launches live on, with the contract to create them. */
  @Get('chains')
  listChains() {
    return this.launches.listChains();
  }

  /**
   * The tokens of every listed launch, in the token list format that wallets
   * and exchanges import (tokenlists.org).
   */
  @Get('token-list')
  tokenList() {
    return this.launches.tokenList();
  }

  /**
   * The description and image of a launch, sent right after the transaction
   * that creates it. 200 with the launch if it is indexed already; 202 with
   * null if they wait for the indexer.
   */
  @Post('details')
  @UseGuards(AuthGuard)
  async sendDetails(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: PendingLaunchDetailsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const launch = await this.launches.sendDetails(currentUser.id, dto);
    res.status(launch ? 200 : 202);
    return { launch };
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.launches.get(id, viewer?.id);
  }

  /** Sets the description and image: once, by the creator, before the start. */
  @Put(':id/details')
  @UseGuards(AuthGuard)
  setDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: LaunchDetailsDto,
  ) {
    return this.launches.setDetails(id, currentUser.id, dto);
  }

  /** Comments on the launch, newest first. Posting one is `POST /posts`. */
  @Get(':id/comments')
  @UseGuards(OptionalAuthGuard)
  async listComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    await this.launches.assertExists(id);
    return this.posts.listLaunchComments(id, query, viewer?.id);
  }

  /** Reacts with an emoji: rocket, fire, gem, eyes, joy or thumbs_down. */
  @Put(':id/reactions/:kind')
  @UseGuards(AuthGuard)
  react(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', ParseReactionKindPipe) kind: ReactionKind,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.launches.setReaction(id, currentUser.id, kind, true);
  }

  @Delete(':id/reactions/:kind')
  @UseGuards(AuthGuard)
  unreact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kind', ParseReactionKindPipe) kind: ReactionKind,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.launches.setReaction(id, currentUser.id, kind, false);
  }
}
