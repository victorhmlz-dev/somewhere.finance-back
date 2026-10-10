import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Page,
  pageArgs,
  type PaginationQueryDto,
  toPage,
} from '../common/pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { extractHashtags } from './hashtags.js';
import {
  POST_INCLUDE,
  type PostRow,
  type PostView,
  toPostView,
} from './post-view.js';

type Counter = 'likesCount' | 'repostsCount';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, dto: CreatePostDto): Promise<PostView> {
    const text = dto.text ?? '';
    if (!text && !dto.image) {
      throw new BadRequestException('A post needs text or an image');
    }
    if (dto.replyToId) await this.assertExists(dto.replyToId);

    const post = await this.prisma.$transaction(async (tx) => {
      if (dto.replyToId) {
        await tx.post.update({
          where: { id: dto.replyToId },
          data: { repliesCount: { increment: 1 } },
        });
      }
      return tx.post.create({
        data: {
          authorId,
          text,
          imageUrl: dto.image,
          parentId: dto.replyToId,
          hashtags: { create: extractHashtags(text) },
        },
      });
    });

    return this.view(post.id, authorId);
  }

  /** Reading a post counts as a view. */
  async get(id: string, viewerId?: string): Promise<PostView> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, deletedAt: null },
      data: { viewsCount: { increment: 1 } },
    });
    if (count === 0) throw new NotFoundException('Post not found');
    return this.view(id, viewerId);
  }

  /**
   * The row stays, emptied, so the replies to this post keep pointing at it;
   * from then on the post itself answers 404 and is left out of every list.
   */
  async remove(userId: string, id: string): Promise<void> {
    const post = await this.assertExists(id);
    if (post.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete a post');
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.post.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date(), text: '', imageUrl: null },
      });
      if (count === 0) return;
      await tx.postHashtag.deleteMany({ where: { postId: id } });
      if (!post.parentId) return;
      await tx.post.update({
        where: { id: post.parentId },
        data: { repliesCount: { decrement: 1 } },
      });
    });
  }

  /** Liking a post already liked changes nothing; same for the other three. */
  like(userId: string, postId: string): Promise<PostView> {
    return this.react(userId, postId, 'likesCount', 1, (tx) =>
      tx.like.createMany({ data: [{ userId, postId }], skipDuplicates: true }),
    );
  }

  unlike(userId: string, postId: string): Promise<PostView> {
    return this.react(userId, postId, 'likesCount', -1, (tx) =>
      tx.like.deleteMany({ where: { userId, postId } }),
    );
  }

  repost(userId: string, postId: string): Promise<PostView> {
    return this.react(userId, postId, 'repostsCount', 1, (tx) =>
      tx.repost.createMany({
        data: [{ userId, postId }],
        skipDuplicates: true,
      }),
    );
  }

  unrepost(userId: string, postId: string): Promise<PostView> {
    return this.react(userId, postId, 'repostsCount', -1, (tx) =>
      tx.repost.deleteMany({ where: { userId, postId } }),
    );
  }

  /** Replies to a post, oldest first, so a conversation reads top to bottom. */
  async listReplies(
    id: string,
    query: PaginationQueryDto,
    viewerId?: string,
  ): Promise<Page<PostView>> {
    await this.assertExists(id);
    const rows = await this.prisma.post.findMany({
      where: { parentId: id, deletedAt: null },
      include: POST_INCLUDE,
      ...pageArgs(query, 'asc'),
    });
    return this.toPostPage(rows, query.limit, viewerId);
  }

  /**
   * The posts with those ids, by id, counting a view for each. Deleted posts
   * are left out.
   */
  async viewsById(
    ids: string[],
    viewerId?: string,
  ): Promise<Map<string, PostView>> {
    const rows = await this.prisma.post.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: POST_INCLUDE,
    });
    await this.countViews(rows);
    const views = await this.toViews(rows, viewerId);
    return new Map(views.map((view) => [view.id, view]));
  }

  private async assertExists(id: string) {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  /**
   * Adds or removes a like or a repost. `change` reports how many rows it
   * touched, so the counter only moves when something really changed.
   */
  private async react(
    userId: string,
    postId: string,
    counter: Counter,
    delta: 1 | -1,
    change: (tx: Prisma.TransactionClient) => Promise<{ count: number }>,
  ): Promise<PostView> {
    await this.assertExists(postId);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await change(tx);
      if (count === 0) return;
      await tx.post.update({
        where: { id: postId },
        data: { [counter]: { increment: delta } },
      });
    });

    return this.view(postId, userId);
  }

  private async view(id: string, viewerId?: string): Promise<PostView> {
    const row = await this.prisma.post.findUniqueOrThrow({
      where: { id },
      include: POST_INCLUDE,
    });
    const [view] = await this.toViews([row], viewerId);
    return view;
  }

  /** Builds a page and counts a view for each post in it. */
  private async toPostPage(
    rows: PostRow[],
    limit: number,
    viewerId?: string,
  ): Promise<Page<PostView>> {
    const pageRows = rows.slice(0, limit);
    await this.countViews(pageRows);

    const views = await this.toViews(pageRows, viewerId);
    const viewById = new Map(views.map((view) => [view.id, view]));
    return toPage(rows, limit, (row) => viewById.get(row.id)!);
  }

  private async countViews(rows: PostRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.post.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { viewsCount: { increment: 1 } },
    });
    for (const row of rows) row.viewsCount += 1;
  }

  private async toViews(
    rows: PostRow[],
    viewerId?: string,
  ): Promise<PostView[]> {
    const liked = new Set<string>();
    const reposted = new Set<string>();

    if (viewerId && rows.length > 0) {
      const where = {
        userId: viewerId,
        postId: { in: rows.map((row) => row.id) },
      };
      const [likes, reposts] = await Promise.all([
        this.prisma.like.findMany({ where, select: { postId: true } }),
        this.prisma.repost.findMany({ where, select: { postId: true } }),
      ]);
      for (const like of likes) liked.add(like.postId);
      for (const repost of reposts) reposted.add(repost.postId);
    }

    return rows.map((row) =>
      toPostView(row, {
        isLiked: liked.has(row.id),
        isReposted: reposted.has(row.id),
      }),
    );
  }
}
