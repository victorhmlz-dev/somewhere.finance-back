import type { Prisma } from '../generated/prisma/client.js';
import type {
  NotificationType,
  ReactionKind,
} from '../generated/prisma/enums.js';

export interface NotificationEvent {
  recipientId: string;
  /** Who did it. Null when nobody did: a purchase told to its own buyer. */
  actorId: string | null;
  type: NotificationType;
  /** The wallet that did it, when it belongs to no user. */
  actorAddress?: string;
  /** The post involved. Leave it out for a follow or a purchase. */
  postId?: string;
  /** The launch involved, for purchases, comments and reactions to it. */
  launchId?: string;
  reaction?: ReactionKind;
  /**
   * For a purchase: what was paid, in the smallest unit of the launch's
   * quote asset, and the tokens bought, as integers in text.
   */
  quoteAmount?: string;
  tokenAmount?: string;
  /** When it happened, if not now: a purchase happened in its block. */
  createdAt?: Date;
  /**
   * For what an event on chain caused, the key of the event: the
   * notification is created once, however many times the chain is read.
   */
  sourceKey?: string;
}

// The two functions below run inside the transaction of what causes the
// notification, so a notification exists exactly when its cause does.

/** Nobody is notified about what they do to themselves. */
export async function addNotification(
  tx: Prisma.TransactionClient,
  event: NotificationEvent,
): Promise<void> {
  if (event.recipientId === event.actorId) return;
  await tx.notification.createMany({ data: [event], skipDuplicates: true });
}

/** For when what caused a notification is undone: an unlike, an unfollow. */
export async function removeNotification(
  tx: Prisma.TransactionClient,
  event: NotificationEvent,
): Promise<void> {
  await tx.notification.deleteMany({
    where: {
      recipientId: event.recipientId,
      actorId: event.actorId,
      type: event.type,
      postId: event.postId ?? null,
      launchId: event.launchId ?? null,
      reaction: event.reaction ?? null,
    },
  });
}
