import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthGuard,
  OptionalAuthGuard,
  type AuthenticatedUser,
} from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ListLaunchesQueryDto } from './dto/list-launches-query.dto.js';
import { UpdateLaunchDto } from './dto/update-launch.dto.js';
import { LaunchesService } from './launches.service.js';

/**
 * Token launches, as read from the launchpad contracts. Creating a launch,
 * contributing, claiming and refunding are transactions the user's wallet
 * sends to the contracts; the API only shows the result.
 */
@Controller('launches')
export class LaunchesController {
  constructor(private readonly launches: LaunchesService) {}

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

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer?: AuthenticatedUser,
  ) {
    return this.launches.get(id, viewer?.id);
  }

  /** Sets the description and the image, which are not on chain. */
  @Patch(':id')
  @UseGuards(AuthGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateLaunchDto,
  ) {
    return this.launches.update(id, currentUser.id, dto);
  }
}
