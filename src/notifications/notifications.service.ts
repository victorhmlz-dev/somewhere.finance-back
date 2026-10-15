import { Injectable } from '@nestjs/common';
import type { Page } from '../common/pagination.js';
import { type AssetView, toAssetView } from '../assets/asset-view.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  NotificationType,
  ReactionKind,
} from '../generated/prisma/enums.js';
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
  /** Who did it, most recent first, up to three. Empty for a `purchase`. */
  actors: UserSummary[];
  /** How many more did it besides the ones in `actors`. */
  otherActorCount: number;
  /**
   * The wallet that bought, for a `launch_purchase` made from a wallet with
   * no Somewhere profile. `actors` is empty then.
   */
  actorAddress: string | null;
  /**
   * The post liked, reposted or reacted to, or the post that mentions,
   * replies or comments. Null for a follow, a purchase or a reaction to a
   * launch.
   */
  post: PostView | null;
  /** The launch bought, commented on or reacted to. */
  launch: NotificationLaunchView | null;
  /** The emoji of a `reaction`. */
  reaction: ReactionKind | null;
  /**
   * What one purchase paid, in the smallest unit of the launch's quote
   * asset, and the tokens it bought. Null for several purchases told
   * together, and for anything else.
   */
  purchase: { quoteAmount: string; tokenAmount: string } | null;
  /** When the most recent actor did it. */
  createdAt: string;
  isUnread: boolean;
}

/** A launch as a notification shows it. */
export interface NotificationLaunchView {
  id: string;
  name: string;
  symbol: string;
  image: string | null;
  tokenDecimals: number;
  /** What it is bought with: a currency, a stablecoin, a tokenized stock… */
  quoteAsset: AssetView;
}

interface NotificationGroup {
  id: string;
  type: NotificationType;
  post_id: string | null;
  launch_id: string | null;
  reaction: ReactionKind | null;
  actor_ids: string[];
  actor_address: string | null;
  actor_count: number;
  quote_amount: string | null;
  token_amount: string | null;
  created_at: Date;
  is_unread: boolean;
}

// What makes rows one notification: the likes, reposts or reactions (of one
// emoji) that a post or a launch gets in one day (UTC), the purchases of one
// launch in one day, or the follows of one day. Mentions, replies, comments,
// your own purchases and purchases by wallets with no profile are never
// grouped.
const GROUP_KEY = Prisma.sql`
  n.type,
  n.post_id,
  n.launch_id,
  n.reaction,
  CASE
    WHEN n.type IN ('mention', 'reply', 'launch_comment', 'purchase')
      OR n.actor_id IS NULL
      THEN n.id::text
    ELSE ((n.created_at AT TIME ZONE 'UTC')::date)::text
  END
`;

const TAB_FILTER: Record<NotificationTab, Prisma.Sql> = {
  all: Prisma.empty,
  // Only what verified users did; the others are left out of each group too.
  verified: Prisma.sql`AND a.verified`,
  mentions: Prisma.sql`AND n.type IN ('mention', 'reply', 'launch_comment')`,
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
          n.launch_id,
          n.reaction::text AS reaction,
          (array_remove(
            array_agg(n.actor_id::text ORDER BY n.id DESC), NULL
          ))[1:3] AS actor_ids,
          (array_agg(n.actor_address ORDER BY n.id DESC))[1] AS actor_address,
          count(*)::int AS actor_count,
          (array_agg(n.quote_amount::text ORDER BY n.id DESC))[1]
            AS quote_amount,
          (array_agg(n.token_amount::text ORDER BY n.id DESC))[1]
            AS token_amount,
          max(n.created_at) AS created_at,
          bool_or(n.read_at IS NULL) AS is_unread
        FROM notifications n
        LEFT JOIN users a ON a.id = n.actor_id
        WHERE n.recipient_id = ${userId}::uuid ${TAB_FILTER[query.tab]}
        GROUP BY ${GROUP_KEY}
      ) g
      ${before}
      ORDER BY g.id DESC
      LIMIT ${query.limit + 1}
    `;

    const pageGroups = groups.slice(0, query.limit);
    const [actors, launches, profiles, postById] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: pageGroups.flatMap((group) => group.actor_ids) } },
      }),
      this.prisma.launch.findMany({
        where: {
          id: { in: pageGroups.flatMap((group) => group.launch_id ?? []) },
        },
        select: {
          id: true,
          name: true,
          symbol: true,
          tokenDecimals: true,
          quoteAsset: true,
        },
      }),
      this.prisma.launchProfile.findMany({
        where: {
          launchId: {
            in: pageGroups.flatMap((group) => group.launch_id ?? []),
          },
        },
        select: { launchId: true, imageUrl: true },
      }),
      // Looking at your notifications is not a view of the posts in them.
      this.posts.viewsById(
        pageGroups.flatMap((group) => group.post_id ?? []),
        userId,
        { countViews: false },
      ),
    ]);
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const launchById = new Map(launches.map((launch) => [launch.id, launch]));
    const imageOf = new Map(profiles.map((p) => [p.launchId, p.imageUrl]));

    const items: NotificationView[] = [];
    for (const group of pageGroups) {
      const post = group.post_id ? postById.get(group.post_id) : null;
      const launch = group.launch_id ? launchById.get(group.launch_id) : null;
      // Skips what was deleted between the queries.
      if (post === undefined || launch === undefined) continue;
      const single = group.actor_count === 1;
      items.push({
        id: group.id,
        type: group.type,
        actors: group.actor_ids.flatMap((id) => {
          const actor = actorById.get(id);
          return actor ? toUserSummary(actor) : [];
        }),
        otherActorCount:
          group.actor_ids.length > 0
            ? group.actor_count - group.actor_ids.length
            : 0,
        actorAddress: group.actor_ids.length === 0 ? group.actor_address : null,
        post,
        launch: launch
          ? {
              id: launch.id,
              name: launch.name,
              symbol: launch.symbol,
              image: imageOf.get(launch.id) ?? null,
              tokenDecimals: launch.tokenDecimals,
              quoteAsset: toAssetView(launch.quoteAsset),
            }
          : null,
        reaction: group.reaction,
        purchase:
          single && group.quote_amount && group.token_amount
            ? {
                quoteAmount: group.quote_amount,
                tokenAmount: group.token_amount,
              }
            : null,
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
