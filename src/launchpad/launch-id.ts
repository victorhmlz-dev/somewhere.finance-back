import { createHash } from 'node:crypto';

/** What identifies a launch on chain. */
export interface LaunchOrigin {
  chainKey: string;
  /** Address of the Launchpad contract, in lowercase. */
  launchpad: string;
  /** Number of the launch inside that contract. */
  launchId: number | bigint;
  /** Time of the block that created it. */
  createdAt: Date;
}

/**
 * The id of a launch, derived from the chain: reading the chain again gives
 * the same id, so the description, comments, reactions and notifications that
 * point to it find the launch again. It is a UUIDv7, so launches still sort
 * by when they were created: its time is the block time, then comes the
 * number of the launch (the sequence a UUIDv7 allows within a millisecond,
 * which orders launches created in the same block), and the rest is the
 * SHA-256 of "<chain>:<launchpad>:<number>". The migration
 * 20261015180000_launch_content_survives_reindex does the same in SQL.
 */
export function launchRowId(origin: LaunchOrigin): string {
  const hash = createHash('sha256')
    .update(
      `${origin.chainKey}:${origin.launchpad.toLowerCase()}:${origin.launchId}`,
    )
    .digest('hex');
  const ms = origin.createdAt.getTime().toString(16).padStart(12, '0');
  const sequence = Number(BigInt(origin.launchId) & 0xfffn)
    .toString(16)
    .padStart(3, '0');
  const variant = (8 | (parseInt(hash[0], 16) & 3)).toString(16);
  return [
    ms.slice(0, 8),
    ms.slice(8, 12),
    `7${sequence}`,
    `${variant}${hash.slice(1, 4)}`,
    hash.slice(4, 16),
  ].join('-');
}
