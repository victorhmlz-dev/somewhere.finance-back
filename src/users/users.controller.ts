import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Edits the profile of the session's user. */
  @Patch('me')
  @UseGuards(AuthGuard)
  updateMe(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(currentUser.id, dto);
  }

  @Get(':handle')
  @UseGuards(OptionalAuthGuard)
  getProfile(
    @Param('handle') handle: string,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.users.getProfile(handle, viewer?.id);
  }

  @Get(':handle/followers')
  @UseGuards(OptionalAuthGuard)
  listFollowers(
    @Param('handle') handle: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.users.listFollowers(handle, query, viewer?.id);
  }

  @Get(':handle/following')
  @UseGuards(OptionalAuthGuard)
  listFollowing(
    @Param('handle') handle: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.users.listFollowing(handle, query, viewer?.id);
  }

  /** Both return the profile of `handle` as the session's user now sees it. */
  @Put(':handle/follow')
  @UseGuards(AuthGuard)
  follow(
    @Param('handle') handle: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.users.follow(currentUser.id, handle);
  }

  @Delete(':handle/follow')
  @UseGuards(AuthGuard)
  unfollow(
    @Param('handle') handle: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.users.unfollow(currentUser.id, handle);
  }
}
