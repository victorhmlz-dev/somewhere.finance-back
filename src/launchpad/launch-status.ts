/** Same states as `TokenSale.Status` in the contracts, in lowercase. */
export type LaunchStatus =
  'upcoming' | 'live' | 'succeeded' | 'failed' | 'finalized' | 'cancelled';

/** `TokenSale.FINALIZE_GRACE_PERIOD`: how long a successful sale can be listed. */
export const FINALIZE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export interface LaunchTimeline {
  startTime: Date;
  endTime: Date;
  /** True when what was raised reached the soft cap. */
  reachedSoftCap: boolean;
  hardCapReachedAt: Date | null;
  finalizedAt: Date | null;
  cancelledAt: Date | null;
}

/** When a sale became successful, or null if it has not (yet). */
function succeededAt(launch: LaunchTimeline, now: Date): Date | null {
  if (launch.hardCapReachedAt) return launch.hardCapReachedAt;
  if (now >= launch.endTime && launch.reachedSoftCap) return launch.endTime;
  return null;
}

/**
 * The state of a sale at `now`. It follows `TokenSale.status()` step by step:
 * a sale changes state as time passes, without any event to index.
 */
export function launchStatus(launch: LaunchTimeline, now: Date): LaunchStatus {
  if (launch.cancelledAt) return 'cancelled';
  if (launch.finalizedAt) return 'finalized';
  if (now < launch.startTime) return 'upcoming';

  const success = succeededAt(launch, now);
  if (!success) return now < launch.endTime ? 'live' : 'failed';

  return now.getTime() < success.getTime() + FINALIZE_GRACE_PERIOD_MS
    ? 'succeeded'
    : 'failed';
}

/**
 * Until when a successful sale can still be finalized. Null for a sale that
 * is not waiting to be finalized.
 */
export function finalizeDeadline(
  launch: LaunchTimeline,
  now: Date,
): Date | null {
  if (launchStatus(launch, now) !== 'succeeded') return null;
  const success = succeededAt(launch, now)!;
  return new Date(success.getTime() + FINALIZE_GRACE_PERIOD_MS);
}
