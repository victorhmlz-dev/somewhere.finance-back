import { Injectable } from '@nestjs/common';
import type { ReactionKind } from '../generated/prisma/enums.js';
import {
  addNotification,
  removeNotification,
} from '../notifications/notification-events.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Every reaction there is, in the order the front shows them. */
export const REACTION_KINDS = [
  'rocket',
  'fire',
  'gem',
  'eyes',
  'joy',
  'thumbs_down',
] as const satisfies readonly ReactionKind[];

/** How many reacted with one emoji, and whether the viewer is one of them. */
export interface ReactionCount {
  kind: ReactionKind;
  count: number;
  reacted: boolean;
}

/** What is reacted to: a post or a launch. */
export type ReactionTarget = { postId: string } | { launchId: string };

const targetField = (target: ReactionTarget) =>
  'postId' in target ? 'postId' : 'launchId';

const targetId = (target: ReactionTarget) =>
  'postId' in target ? target.postId : target.launchId;

/**
 * Emoji reactions. A user can react to the same thing with several emojis,
 * but with each one once; reacting again with it changes nothing.
 */
@Injectable()
export class ReactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adds or removes one reaction. `ownerId` is the user who hears about it:
   * the author of the post or the creator of the launch, if they have a
   * profile. Nothing happens when the reaction was already as asked.
   */
  async set(
    userId: string,
    target: ReactionTarget,
    kind: ReactionKind,
    on: boolean,
    ownerId: string | null,
  ): Promise<void> {
    const where = { userId, kind, ...target };
    await this.prisma.$transaction(async (tx) => {
      const { count } = on
        ? await tx.reaction.createMany({ data: [where], skipDuplicates: true })
        : await tx.reaction.deleteMany({ where });
      if (count === 0 || !ownerId) return;

      const event = {
        recipientId: ownerId,
        actorId: userId,
        type: 'reaction' as const,
        reaction: kind,
        ...target,
      };
      if (on) await addNotification(tx, event);
      else await removeNotification(tx, event);
    });
  }

  /**
   * The reactions of several posts, or of several launches, by id. Every
   * kind is listed, with zero when nobody used it.
   */
  async countsFor(
    field: 'postId' | 'launchId',
    ids: string[],
    viewerId?: string,
  ): Promise<Map<string, ReactionCount[]>> {
    const result = new Map<string, ReactionCount[]>();
    if (ids.length === 0) return result;

    const [groups, mine] = await Promise.all([
      this.prisma.reaction.groupBy({
        by: [field, 'kind'],
        where: { [field]: { in: ids } },
        _count: { _all: true },
      }),
      viewerId
        ? this.prisma.reaction.findMany({
            where: { userId: viewerId, [field]: { in: ids } },
            select: { postId: true, launchId: true, kind: true },
          })
        : Promise.resolve([]),
    ]);

    const counts = new Map<string, number>();
    for (const group of groups) {
      counts.set(`${group[field]}:${group.kind}`, group._count._all);
    }
    const reacted = new Set(
      mine.map((reaction) => `${reaction[field]}:${reaction.kind}`),
    );
    for (const id of ids) {
      result.set(
        id,
        REACTION_KINDS.map((kind) => ({
          kind,
          count: counts.get(`${id}:${kind}`) ?? 0,
          reacted: reacted.has(`${id}:${kind}`),
        })),
      );
    }
    return result;
  }

  /** The reactions of one post or launch. */
  async countsOf(
    target: ReactionTarget,
    viewerId?: string,
  ): Promise<ReactionCount[]> {
    const counts = await this.countsFor(
      targetField(target),
      [targetId(target)],
      viewerId,
    );
    return counts.get(targetId(target))!;
  }
}
