import type { Prisma } from '../generated/prisma/client.js';
import type { NotificationType } from '../generated/prisma/enums.js';

export interface NotificationEvent {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  /** The post involved. Leave it out for a follow. */
  postId?: string;
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
    where: { ...event, postId: event.postId ?? null },
  });
}
