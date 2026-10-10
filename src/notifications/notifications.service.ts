import { Injectable } from '@nestjs/common';
import type { Page } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import type { NotificationType } from '../generated/prisma/enums.js';
import type { PostView } from '../posts/post-view.js';
import { PostsService } from '../posts/posts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserSummary, type UserSummary } from '../users/user-profile.js';
import type {
  NotificationsQueryDto,
  NotificationTab,
} from './dto/notifications-query.dto.js';

/**
 * A notification as the front expects it (see `notificationData.js` in the
 * front): "Aria, Yuki and 12 others liked your post".
 */
export interface NotificationView {
  id: string;
  type: NotificationType;
  /** Who did it, most recent first, up to three. */
  actors: UserSummary[];
  /** How many more did it besides the ones in `actors`. */
  otherActorCount: number;
  /**
   * The post liked or reposted, or the post that mentions or replies.
   * Null for a follow.
   */
  post: PostView | null;
  /** When the most recent actor did it. */
  createdAt: string;
  isUnread: boolean;
}

interface NotificationGroup {
  id: string;
  type: NotificationType;
  post_id: string | null;
  actor_ids: string[];
  actor_count: number;
  created_at: Date;
  is_unread: boolean;
}

// What makes rows one notification: the likes or reposts that a post gets in
// one day (UTC), or the follows of one day. A mention or a reply is never
// grouped.
const GROUP_KEY = Prisma.sql`
  n.type,
  n.post_id,
  CASE
    WHEN n.type IN ('mention', 'reply') THEN n.id::text
    ELSE ((n.created_at AT TIME ZONE 'UTC')::date)::text
  END
`;

const TAB_FILTER: Record<NotificationTab, Prisma.Sql> = {
  all: Prisma.empty,
  // Only what verified users did; the others are left out of each group too.
  verified: Prisma.sql`AND a.verified`,
  mentions: Prisma.sql`AND n.type IN ('mention', 'reply')`,
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
  ) {}

  /** Newest first. A group is as recent as the last thing that joined it. */
  async list(
    userId: string,
    query: NotificationsQueryDto,
  ): Promise<Page<NotificationView>> {
    const before = query.cursor
      ? Prisma.sql`WHERE g.id < ${query.cursor}::uuid`
      : Prisma.empty;

    const groups = await this.prisma.$queryRaw<NotificationGroup[]>`
      SELECT g.*
      FROM (
        SELECT
          (array_agg(n.id ORDER BY n.id DESC))[1] AS id,
          n.type::text AS type,
          n.post_id,
          (array_agg(n.actor_id::text ORDER BY n.id DESC))[1:3] AS actor_ids,
          count(*)::int AS actor_count,
          max(n.created_at) AS created_at,
          bool_or(n.read_at IS NULL) AS is_unread
        FROM notifications n
        JOIN users a ON a.id = n.actor_id
        WHERE n.recipient_id = ${userId}::uuid ${TAB_FILTER[query.tab]}
        GROUP BY ${GROUP_KEY}
      ) g
      ${before}
      ORDER BY g.id DESC
      LIMIT ${query.limit + 1}
    `;

    const pageGroups = groups.slice(0, query.limit);
    const [actors, postById] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: pageGroups.flatMap((group) => group.actor_ids) } },
      }),
      // Looking at your notifications is not a view of the posts in them.
      this.posts.viewsById(
        pageGroups.flatMap((group) => group.post_id ?? []),
        userId,
        { countViews: false },
      ),
    ]);
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    const items: NotificationView[] = [];
    for (const group of pageGroups) {
      const post = group.post_id ? postById.get(group.post_id) : null;
      // Skips what was deleted between the two queries.
      if (post === undefined) continue;
      items.push({
        id: group.id,
        type: group.type,
        actors: group.actor_ids.flatMap((id) => {
          const actor = actorById.get(id);
          return actor ? toUserSummary(actor) : [];
        }),
        otherActorCount: group.actor_count - group.actor_ids.length,
        post,
        createdAt: group.created_at.toISOString(),
        isUnread: group.is_unread,
      });
    }

    return {
      items,
      nextCursor:
        groups.length > query.limit
          ? pageGroups[pageGroups.length - 1].id
          : null,
    };
  }

  /** Counts notifications as the list shows them, not the rows behind them. */
  async countUnread(userId: string): Promise<{ count: number }> {
    const [{ count }] = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM (
        SELECT 1
        FROM notifications n
        WHERE n.recipient_id = ${userId}::uuid AND n.read_at IS NULL
        GROUP BY ${GROUP_KEY}
      ) g
    `;
    return { count };
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
