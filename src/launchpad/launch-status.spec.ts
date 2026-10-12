import {
  finalizeDeadline,
  launchStatus,
  type LaunchTimeline,
} from './launch-status.js';

const DAY = 24 * 60 * 60 * 1000;
const start = new Date('2026-10-01T00:00:00Z');
const end = new Date('2026-10-08T00:00:00Z');
const at = (date: Date, offsetMs: number) =>
  new Date(date.getTime() + offsetMs);

const launch = (changes: Partial<LaunchTimeline> = {}): LaunchTimeline => ({
  startTime: start,
  endTime: end,
  reachedSoftCap: false,
  hardCapReachedAt: null,
  finalizedAt: null,
  ...changes,
});

describe('launchStatus', () => {
  it('is upcoming until the second the sale starts', () => {
    expect(launchStatus(launch(), at(start, -1000))).toBe('upcoming');
    expect(launchStatus(launch(), start)).toBe('live');
  });

  it('is live until the second the sale ends', () => {
    expect(launchStatus(launch(), at(end, -1000))).toBe('live');
  });

  it('fails at the end without the soft cap', () => {
    expect(launchStatus(launch(), end)).toBe('failed');
  });

  it('succeeds at the end with the soft cap, for seven days', () => {
    const sale = launch({ reachedSoftCap: true });
    expect(launchStatus(sale, at(end, -1000))).toBe('live');
    expect(launchStatus(sale, end)).toBe('succeeded');
    expect(launchStatus(sale, at(end, 7 * DAY - 1000))).toBe('succeeded');
    expect(launchStatus(sale, at(end, 7 * DAY))).toBe('failed');
  });

  it('succeeds as soon as it sells out, counting the seven days from then', () => {
    const soldOutAt = at(start, DAY);
    const sale = launch({ reachedSoftCap: true, hardCapReachedAt: soldOutAt });
    expect(launchStatus(sale, soldOutAt)).toBe('succeeded');
    expect(launchStatus(sale, at(soldOutAt, 7 * DAY - 1000))).toBe('succeeded');
    // Earlier than seven days after the scheduled end of the sale.
    expect(at(soldOutAt, 7 * DAY) < at(end, 7 * DAY)).toBe(true);
    expect(launchStatus(sale, at(soldOutAt, 7 * DAY))).toBe('failed');
  });

  it('stays finalized forever', () => {
    const sale = launch({
      reachedSoftCap: true,
      hardCapReachedAt: at(start, DAY),
      finalizedAt: at(start, 2 * DAY),
    });
    expect(launchStatus(sale, at(end, 365 * DAY))).toBe('finalized');
  });
});

describe('finalizeDeadline', () => {
  it('is seven days after the sale succeeded', () => {
    const soldOutAt = at(start, DAY);
    const sale = launch({ reachedSoftCap: true, hardCapReachedAt: soldOutAt });
    expect(finalizeDeadline(sale, at(soldOutAt, DAY))).toEqual(
      at(soldOutAt, 7 * DAY),
    );
  });

  it('is null for a sale that is not waiting to be finalized', () => {
    expect(finalizeDeadline(launch(), at(start, DAY))).toBeNull();
    expect(finalizeDeadline(launch(), end)).toBeNull();
    expect(
      finalizeDeadline(
        launch({ reachedSoftCap: true, finalizedAt: end }),
        at(end, DAY),
      ),
    ).toBeNull();
  });
});
