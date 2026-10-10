import { Injectable } from '@nestjs/common';
import {
  type Page,
  pageArgs,
  type PaginationQueryDto,
} from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import type { PostView } from '../posts/post-view.js';
import { PostsService } from '../posts/posts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserSummary, type UserSummary } from '../users/user-profile.js';
import {
  UsersService,
  type ViewedUserSummary,
} from '../users/users.service.js';

const TRENDING_WINDOW_HOURS = 24;

/** One entry of a timeline: a post, or somebody's repost of it. */
export interface TimelineItem {
  /**
   * Unique within the timeline. The same post can appear more than once, as
   * itself and as reposts, so this is not always the id of the post.
   */
  id: string;
  post: PostView;
  /** Who reposted it, or null when the entry is the post itself. */
  repostedBy: UserSummary | null;
}

export interface Trend {
  /** As most people write it, with the `#`. */
  hashtag: string;
  /** What to ask `GET /hashtags/:tag/posts` for. */
  tag: string;
  postCount: number;
}

interface TimelineEvent {
  id: string;
  post_id: string;
  reposter_id: string | null;
}

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly users: UsersService,
  ) {}

  /** Every post, newest first. Replies and reposts are left out. */
  async discover(
    query: PaginationQueryDto,
    viewerId?: string,
  ): Promise<Page<TimelineItem>> {
    const rows = await this.prisma.post.findMany({
      where: { parentId: null, deletedAt: null },
      select: { id: true },
      ...pageArgs(query),
    });
    return this.toTimelinePage(rows.map(toPostEvent), query.limit, viewerId);
  }

  /** Posts and reposts by the viewer and by the users the viewer follows. */
  network(
    query: PaginationQueryDto,
    viewerId: string,
  ): Promise<Page<TimelineItem>> {
    return this.timeline(
      Prisma.sql`(
        e.actor_id = ${viewerId}::uuid
        OR e.actor_id IN (
          SELECT following_id FROM follows WHERE follower_id = ${viewerId}::uuid
        )
      )`,
      query,
      viewerId,
    );
  }

  /** Posts and reposts by `handle`, as shown on their profile. */
  async byUser(
    handle: string,
    query: PaginationQueryDto,
    viewerId?: string,
  ): Promise<Page<TimelineItem>> {
    const user = await this.users.findByHandle(handle);
    return this.timeline(
      Prisma.sql`e.actor_id = ${user.id}::uuid`,
      query,
      viewerId,
    );
  }

  /** Posts and replies that contain the hashtag, newest first. */
  async byHashtag(
    tag: string,
    query: PaginationQueryDto,
    viewerId?: string,
  ): Promise<Page<TimelineItem>> {
    const rows = await this.prisma.postHashtag.findMany({
      where: {
        tag: tag.toLowerCase(),
        ...(query.cursor ? { postId: { lt: query.cursor } } : {}),
      },
      select: { postId: true },
      orderBy: { postId: 'desc' },
      take: query.limit + 1,
    });
    return this.toTimelinePage(
      rows.map((row) => toPostEvent({ id: row.postId })),
      query.limit,
      viewerId,
    );
  }

  /** The hashtags with most posts in the last 24 hours. */
  async trending(limit: number): Promise<{ items: Trend[] }> {
    const since = new Date(Date.now() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<
      { tag: string; label: string; post_count: number }[]
    >`
      SELECT
        h.tag,
        mode() WITHIN GROUP (ORDER BY h.label) AS label,
        count(*)::int AS post_count
      FROM post_hashtags h
      JOIN posts p ON p.id = h.post_id
      WHERE p.deleted_at IS NULL AND p.created_at >= ${since}
      GROUP BY h.tag
      ORDER BY post_count DESC, h.tag
      LIMIT ${limit}
    `;
    return {
      items: rows.map((row) => ({
        hashtag: `#${row.label}`,
        tag: row.tag,
        postCount: row.post_count,
      })),
    };
  }

  /** The most followed users that the viewer does not follow yet. */
  async whoToFollow(
    limit: number,
    viewerId?: string,
  ): Promise<{ items: ViewedUserSummary[] }> {
    const users = await this.prisma.user.findMany({
      where: viewerId
        ? {
            id: { not: viewerId },
            followers: { none: { followerId: viewerId } },
          }
        : {},
      orderBy: [{ followersCount: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return {
      items: users.map((user) => ({
        ...toUserSummary(user),
        isFollowing: false,
      })),
    };
  }

  /**
   * One page of posts and reposts merged in a single timeline, newest first.
   * Both tables use UUID v7 ids, so ordering by id orders the two together by
   * the moment each thing happened. `scope` limits whose activity is shown;
   * `e.actor_id` is the author of a post or the user who reposted.
   */
  private async timeline(
    scope: Prisma.Sql,
    query: PaginationQueryDto,
    viewerId?: string,
  ): Promise<Page<TimelineItem>> {
    const before = query.cursor
      ? Prisma.sql`AND e.id < ${query.cursor}::uuid`
      : Prisma.empty;

    const events = await this.prisma.$queryRaw<TimelineEvent[]>`
      SELECT e.id, e.post_id, e.reposter_id
      FROM (
        SELECT
          p.id,
          p.id AS post_id,
          NULL::uuid AS reposter_id,
          p.author_id AS actor_id
        FROM posts p
        WHERE p.parent_id IS NULL AND p.deleted_at IS NULL
        UNION ALL
        SELECT r.id, r.post_id, r.user_id AS reposter_id, r.user_id AS actor_id
        FROM reposts r
        JOIN posts p ON p.id = r.post_id
        WHERE p.deleted_at IS NULL
      ) e
      WHERE ${scope} ${before}
      ORDER BY e.id DESC
      LIMIT ${query.limit + 1}
    `;
    return this.toTimelinePage(events, query.limit, viewerId);
  }

  /** Expects `limit + 1` events, like `toPage`. */
  private async toTimelinePage(
    events: TimelineEvent[],
    limit: number,
    viewerId?: string,
  ): Promise<Page<TimelineItem>> {
    const pageEvents = events.slice(0, limit);
    const reposterIds = pageEvents.flatMap((event) => event.reposter_id ?? []);

    const [postById, reposters] = await Promise.all([
      this.posts.viewsById(
        [...new Set(pageEvents.map((event) => event.post_id))],
        viewerId,
      ),
      this.prisma.user.findMany({ where: { id: { in: reposterIds } } }),
    ]);
    const reposterById = new Map(reposters.map((user) => [user.id, user]));

    const items: TimelineItem[] = [];
    for (const event of pageEvents) {
      const post = postById.get(event.post_id);
      const reposter = event.reposter_id
        ? reposterById.get(event.reposter_id)
        : null;
      // Skips what was deleted between the two queries.
      if (!post || reposter === undefined) continue;
      items.push({
        id: event.id,
        post,
        repostedBy: reposter ? toUserSummary(reposter) : null,
      });
    }

    return {
      items,
      nextCursor:
        events.length > limit ? pageEvents[pageEvents.length - 1].id : null,
    };
  }
}

const toPostEvent = ({ id }: { id: string }): TimelineEvent => ({
  id,
  post_id: id,
  reposter_id: null,
});
