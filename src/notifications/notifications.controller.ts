import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { NotificationsQueryDto } from './dto/notifications-query.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Every route is about the notifications of the session's user. */
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: NotificationsQueryDto,
  ) {
    return this.notifications.list(currentUser.id, query);
  }

  /** For the badge on the navigation. */
  @Get('unread-count')
  countUnread(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notifications.countUnread(currentUser.id);
  }

  /** Marks every notification as read. */
  @Post('read')
  @HttpCode(204)
  markAllRead(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notifications.markAllRead(currentUser.id);
  }
}
