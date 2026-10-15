import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type Page,
  pageArgs,
  type PaginationQueryDto,
  toPage,
} from '../common/pagination.js';
import type { User } from '../generated/prisma/client.js';
import {
  addNotification,
  removeNotification,
} from '../notifications/notification-events.js';
import { isUniqueViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  toUserProfile,
  toUserSummary,
  type UserProfile,
  type UserSummary,
} from './user-profile.js';

/** Whether the user asking follows this one. False for anonymous requests. */
interface ViewerRelation {
  isFollowing: boolean;
}

export type ViewedUserProfile = UserProfile & ViewerRelation;
export type ViewedUserSummary = UserSummary & ViewerRelation;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async getProfile(
    handle: string,
    viewerId?: string,
  ): Promise<ViewedUserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { handle: handle.toLowerCase() },
      include: { wallets: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const followed = await this.followedBy(viewerId, [user.id]);
    return { ...toUserProfile(user), isFollowing: followed.has(user.id) };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    if (dto.avatar) await this.uploads.assertOwnImage(dto.avatar, 'avatar');
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          handle: dto.handle,
          bio: dto.bio,
          avatarUrl: dto.avatar,
        },
        include: { wallets: true },
      });
      return toUserProfile(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Handle is already taken');
      }
      throw error;
    }
  }

  /** Following someone already followed changes nothing. */
  async follow(followerId: string, handle: string): Promise<ViewedUserProfile> {
    const target = await this.findByHandle(handle);
    if (target.id === followerId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.follow.createMany({
        data: [{ followerId, followingId: target.id }],
        skipDuplicates: true,
      });
      if (count === 0) return;
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      });
      await tx.user.update({
        where: { id: target.id },
        data: { followersCount: { increment: 1 } },
      });
      await addNotification(tx, {
        recipientId: target.id,
        actorId: followerId,
        type: 'follow',
      });
    });

    return this.getProfile(target.handle, followerId);
  }

  /** Unfollowing someone not followed changes nothing. */
  async unfollow(
    followerId: string,
    handle: string,
  ): Promise<ViewedUserProfile> {
    const target = await this.findByHandle(handle);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.follow.deleteMany({
        where: { followerId, followingId: target.id },
      });
      if (count === 0) return;
      await tx.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      });
      await tx.user.update({
        where: { id: target.id },
        data: { followersCount: { decrement: 1 } },
      });
      await removeNotification(tx, {
        recipientId: target.id,
        actorId: followerId,
        type: 'follow',
      });
    });

    return this.getProfile(target.handle, followerId);
  }

  /** Users who follow `handle`, most recent follow first. */
  async listFollowers(
    handle: string,
    query: PaginationQueryDto,
    viewerId?: string,
  ): Promise<Page<ViewedUserSummary>> {
    const user = await this.findByHandle(handle);
    const rows = await this.prisma.follow.findMany({
      where: { followingId: user.id },
      include: { follower: true },
      ...pageArgs(query),
    });
    return this.toUserPage(
      rows.map((row) => ({ id: row.id, user: row.follower })),
      query.limit,
      viewerId,
    );
  }

  /** Users that `handle` follows, most recent follow first. */
  async listFollowing(
    handle: string,
    query: PaginationQueryDto,
    viewerId?: string,
  ): Promise<Page<ViewedUserSummary>> {
    const user = await this.findByHandle(handle);
    const rows = await this.prisma.follow.findMany({
      where: { followerId: user.id },
      include: { following: true },
      ...pageArgs(query),
    });
    return this.toUserPage(
      rows.map((row) => ({ id: row.id, user: row.following })),
      query.limit,
      viewerId,
    );
  }

  async findByHandle(handle: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { handle: handle.toLowerCase() },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async toUserPage(
    rows: { id: string; user: User }[],
    limit: number,
    viewerId?: string,
  ): Promise<Page<ViewedUserSummary>> {
    const followed = await this.followedBy(
      viewerId,
      rows.map((row) => row.user.id),
    );
    return toPage(rows, limit, ({ user }) => ({
      ...toUserSummary(user),
      isFollowing: followed.has(user.id),
    }));
  }

  /** Which of `userIds` the viewer follows. */
  private async followedBy(
    viewerId: string | undefined,
    userIds: string[],
  ): Promise<Set<string>> {
    if (!viewerId || userIds.length === 0) return new Set();
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: userIds } },
      select: { followingId: true },
    });
    return new Set(follows.map((follow) => follow.followingId));
  }
}
