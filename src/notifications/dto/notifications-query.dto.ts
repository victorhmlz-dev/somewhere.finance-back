import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

export const NOTIFICATION_TABS = ['all', 'verified', 'mentions'] as const;
export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

export class NotificationsQueryDto extends PaginationQueryDto {
  /** The tab of the front: everything, only from verified users, or only mentions and replies. */
  @IsOptional()
  @IsIn(NOTIFICATION_TABS)
  tab: NotificationTab = 'all';
}
