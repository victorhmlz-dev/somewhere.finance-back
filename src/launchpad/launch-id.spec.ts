import { launchRowId } from './launch-id.js';

const origin = {
  chainKey: 'sepolia',
  launchpad: '0xb393ef85b97f9a0391cc612eb97707e7078e0261',
  launchId: 0,
  createdAt: new Date('2026-10-15T00:16:00Z'),
};

describe('launchRowId', () => {
  it('gives the id the migration gives in SQL', () => {
    // Computed by the migration for the first launch of Sepolia
    expect(launchRowId(origin)).toBe('01a13cea-7200-7000-ac50-69c7c43e3537');
  });

  it('is the same for the same launch, whatever the case of the address', () => {
    expect(
      launchRowId({ ...origin, launchpad: origin.launchpad.toUpperCase() }),
    ).toBe(launchRowId(origin));
  });

  it('is a UUIDv7 that sorts by block time', () => {
    const id = launchRowId(origin);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const later = launchRowId({
      ...origin,
      launchId: 1,
      createdAt: new Date('2026-10-15T00:16:01Z'),
    });
    expect(later > id).toBe(true);
  });

  it('orders launches created in the same block by their number', () => {
    const second = launchRowId({ ...origin, launchId: 1 });
    expect(second > launchRowId(origin)).toBe(true);
    expect(launchRowId({ ...origin, launchId: 2 }) > second).toBe(true);
  });

  it('differs between contracts, numbers and chains', () => {
    const ids = new Set([
      launchRowId(origin),
      launchRowId({ ...origin, launchId: 1 }),
      launchRowId({ ...origin, chainKey: 'ethereum' }),
      launchRowId({
        ...origin,
        launchpad: '0x83c968b3e5eebaabe78a6f5f9235207d942804e1',
      }),
    ]);
    expect(ids.size).toBe(4);
  });
});
