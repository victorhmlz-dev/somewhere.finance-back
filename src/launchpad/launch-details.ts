import type { Launch, Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

export interface LaunchDetails {
  description: string;
  imageUrl: string | null;
}

/** Why a creator's description and image were not applied. */
export type DetailsRefusal = 'not-creator' | 'already-set' | 'started';

/** The EVM wallets of a user, in lowercase. */
export async function evmWalletsOf(tx: Tx, userId: string): Promise<string[]> {
  const wallets = await tx.wallet.findMany({
    where: { userId, family: 'evm' },
    select: { address: true },
  });
  return wallets.map((wallet) => wallet.address);
}

/**
 * Sets the description and image of a launch. They are set together, once,
 * by the user who holds the creator's wallet, and only before the sale
 * starts: from then on they never change. Returns why not, or null when set.
 */
export async function applyLaunchDetails(
  tx: Tx,
  launch: Launch,
  userId: string,
  details: LaunchDetails,
  now: Date,
): Promise<DetailsRefusal | null> {
  if (!(await evmWalletsOf(tx, userId)).includes(launch.creatorAddress)) {
    return 'not-creator';
  }
  if (launch.detailsSetAt) return 'already-set';
  if (launch.cancelledAt || now >= launch.startTime) return 'started';

  // Conditional, so two requests at once cannot both set them
  const { count } = await tx.launch.updateMany({
    where: { id: launch.id, detailsSetAt: null },
    data: {
      description: details.description,
      imageUrl: details.imageUrl,
      detailsSetAt: now,
    },
  });
  return count === 0 ? 'already-set' : null;
}

/**
 * Applies the details waiting for a launch that was just indexed, if its
 * creator sent them, and forgets every one sent for it. Anyone can send
 * details for any transaction; only the creator's are applied.
 */
export async function applyPendingDetails(
  tx: Tx,
  launch: Launch,
  now: Date,
): Promise<void> {
  const where = { chainKey: launch.chainKey, txHash: launch.createdTxHash };
  const pending = await tx.pendingLaunchDetails.findMany({
    where,
    orderBy: { id: 'asc' },
  });
  for (const details of pending) {
    const refusal = await applyLaunchDetails(
      tx,
      launch,
      details.userId,
      details,
      now,
    );
    if (refusal !== 'not-creator') break;
  }
  await tx.pendingLaunchDetails.deleteMany({ where });
}
