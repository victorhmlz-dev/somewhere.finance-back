import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseEther, parseUnits, type Hex } from 'viem';
import type { App } from 'supertest/types.js';
import type { LaunchpadChainConfig } from '../src/config/chains.js';
import {
  creatorVestingV3Events,
  launchpadEvents,
  launchpadV3Events,
  tokenSaleV3Events,
} from '../src/launchpad/abi.js';
import { CHAIN_READER_FACTORY } from '../src/launchpad/chain-reader.js';
import { LaunchIndexerService } from '../src/launchpad/launch-indexer.service.js';
import type { LaunchView } from '../src/launchpad/launch-view.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeChain, type FakeEvent } from './fake-chain.js';
import { apiClient } from './session.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const randomAddress = () => `0x${randomBytes(20).toString('hex')}` as Hex;
const seconds = (date: Date) => BigInt(Math.floor(date.getTime() / 1000));
const usd = (amount: string) => parseUnits(amount, 6);

// Needs the database from `npm run db:up`. The chain is a fake in memory.
describe('Launchpad v3 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let indexer: LaunchIndexerService;
  let chain: FakeChain;
  const previousEnv = {
    CHAINS: process.env.CHAINS,
    INDEXER_POLL_MS: process.env.INDEXER_POLL_MS,
  };

  // One chain with a v2 and a v3 Launchpad, and another with only a v2
  const suffix = randomBytes(4).toString('hex');
  const chainKey = `e2e3-${suffix}`;
  const otherChainKey = `e2e3b-${suffix}`;
  const v2 = randomAddress();
  const v3 = randomAddress();
  const otherV2 = randomAddress();
  // What the v3 Launchpad pairs with
  const weth = randomAddress();
  const usdc = randomAddress();
  const stock = randomAddress();
  let nextLaunchId = 0;

  const chainOf = (key: string): LaunchpadChainConfig => ({
    key,
    family: 'evm',
    chainId: key === chainKey ? 31337 : 31338,
    name: key === chainKey ? 'Test chain' : 'Other chain',
    nativeCurrency: { symbol: 'TST', name: 'Test coin', decimals: 18 },
    rpcUrl: 'http://127.0.0.1:1',
    launchpads:
      key === chainKey
        ? [
            { address: v2.toLowerCase() as Hex, version: 2, startBlock: 0 },
            { address: v3.toLowerCase() as Hex, version: 3, startBlock: 0 },
          ]
        : [
            {
              address: otherV2.toLowerCase() as Hex,
              version: 2,
              startBlock: 0,
            },
          ],
    assets:
      key === chainKey
        ? [
            {
              address: usdc.toLowerCase() as Hex,
              kind: 'stablecoin',
              issuer: 'Circle',
              canFreeze: true,
              priceId: null,
            },
            {
              address: stock.toLowerCase() as Hex,
              kind: 'stock',
              issuer: 'Robinhood',
              canFreeze: true,
              priceId: null,
            },
          ]
        : [],
    confirmations: 0,
    logBlockRange: 2000,
  });

  const api = () => apiClient(app);
  const sync = async () => {
    await indexer.sync(chainOf(chainKey), chain);
    await indexer.sync(chainOf(otherChainKey), chain);
  };

  const allow = (asset: Hex, allowed: boolean, minSoftCap: bigint) =>
    ({
      address: v3,
      abi: launchpadV3Events,
      name: 'QuoteAssetUpdated',
      args: { asset, allowed, minSoftCap },
    }) as FakeEvent;

  /** The events of a v3 launch, built the way the contracts emit them. */
  function newV3Launch(quoteAsset: Hex, symbol: string, hardCap: bigint) {
    const launch = {
      launchId: BigInt(nextLaunchId++),
      creator: randomAddress(),
      token: randomAddress(),
      sale: randomAddress(),
      vesting: randomAddress(),
      params: {
        name: `${symbol} Token`,
        symbol,
        totalSupply: parseEther('1000000'),
        quoteAsset,
        softCap: hardCap / 5n,
        hardCap,
        minContribution: 0n,
        maxContribution: 0n,
        startTime: seconds(new Date(Date.now() - HOUR)),
        endTime: seconds(new Date(Date.now() + DAY)),
        creatorAllocationBps: 100,
        liquidityBps: 7000,
        vestingTranches: 3,
        requiredTier: 0,
      },
      tokensForSale: parseEther('582352'),
      creatorAllocation: parseEther('10000'),
      feeBps: 50,
    };
    const saleEvent = (name: string, args: Record<string, unknown>) =>
      ({
        address: launch.sale,
        abi: tokenSaleV3Events,
        name,
        args,
      }) as FakeEvent;
    return {
      ...launch,
      created: {
        address: v3,
        abi: launchpadV3Events,
        name: 'LaunchCreated',
        args: launch,
      } as FakeEvent,
      saleEvent,
      released: (quoteAmount: bigint, tokenAmount: bigint) =>
        ({
          address: launch.vesting,
          abi: creatorVestingV3Events,
          name: 'Released',
          args: { quoteAmount, tokenAmount, tranchesVested: 1n },
        }) as FakeEvent,
    };
  }

  /** A launch of a v2 Launchpad, sold for the chain's currency. */
  function newV2Launch(launchpad: Hex, symbol: string) {
    return {
      address: launchpad,
      abi: launchpadEvents,
      name: 'LaunchCreated',
      args: {
        launchId: BigInt(nextLaunchId++),
        creator: randomAddress(),
        token: randomAddress(),
        sale: randomAddress(),
        vesting: randomAddress(),
        params: {
          name: `${symbol} Token`,
          symbol,
          totalSupply: parseEther('1000000'),
          softCap: parseEther('2'),
          hardCap: parseEther('10'),
          minContribution: 0n,
          maxContribution: 0n,
          startTime: seconds(new Date(Date.now() - HOUR)),
          endTime: seconds(new Date(Date.now() + DAY)),
          creatorAllocationBps: 100,
          liquidityBps: 7000,
          vestingTranches: 3,
        },
        tokensForSale: parseEther('582352'),
        creatorAllocation: parseEther('10000'),
        feeBps: 50,
      },
    } as FakeEvent;
  }

  const findLaunch = async (symbol: string): Promise<LaunchView> => {
    const response = await api()
      .get(`/launches?chain=${chainKey}&q=${symbol}`)
      .expect(200);
    expect(response.body.items).toHaveLength(1);
    return response.body.items[0];
  };

  const uniqueSymbol = () => `V${randomBytes(3).toString('hex').toUpperCase()}`;

  beforeAll(async () => {
    process.env.CHAINS = JSON.stringify([
      chainOf(chainKey),
      chainOf(otherChainKey),
    ]);
    // The app's own polling stays out of the way; the tests call sync().
    process.env.INDEXER_POLL_MS = String(DAY);

    // The app reads its configuration when it is first imported.
    const { AppModule } = await import('../src/app.module.js');

    chain = new FakeChain();
    chain.mine();
    chain.setWrappedNative(v3, weth);
    chain.setToken(usdc, { symbol: 'USDC', name: 'USD Coin', decimals: 6 });
    chain.setToken(stock, { symbol: 'NVDA', name: 'NVIDIA', decimals: 18 });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CHAIN_READER_FACTORY)
      .useValue(() => chain)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    indexer = app.get(LaunchIndexerService);

    chain.mine([
      allow(weth, true, parseEther('0.01')),
      allow(usdc, true, usd('10')),
      allow(stock, true, parseEther('1')),
    ]);
    await sync();
  });

  afterAll(async () => {
    const chainKeys = [chainKey, otherChainKey];
    await prisma.launchpadQuoteAsset.deleteMany({
      where: { chainKey: { in: chainKeys } },
    });
    await prisma.launchContribution.deleteMany({
      where: { launch: { chainKey: { in: chainKeys } } },
    });
    await prisma.launch.deleteMany({ where: { chainKey: { in: chainKeys } } });
    await prisma.chainEvent.deleteMany({
      where: { chainKey: { in: chainKeys } },
    });
    await prisma.chainCursor.deleteMany({
      where: { chainKey: { in: chainKeys } },
    });
    await prisma.asset.deleteMany({ where: { chainKey: { in: chainKeys } } });
    await app.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('lists the assets the v3 Launchpad allows, the dollar first', async () => {
    // The stock stops being allowed
    chain.mine([allow(stock, false, parseEther('1'))]);
    await sync();

    const response = await api().get('/launches/chains').expect(200);
    const item = response.body.items.find(
      (entry: { key: string }) => entry.key === chainKey,
    );
    expect(item).toMatchObject({
      launchpad: v3.toLowerCase(),
      launchpadVersion: 3,
    });
    expect(item.quoteAssets).toEqual([
      {
        chainKey,
        address: usdc.toLowerCase(),
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        kind: 'stablecoin',
        issuer: 'Circle',
        canFreeze: true,
        minSoftCap: usd('10').toString(),
      },
      {
        chainKey,
        // The wrapped native currency: buyers pay the currency itself
        address: null,
        symbol: 'TST',
        name: 'Test coin',
        decimals: 18,
        kind: 'native',
        issuer: null,
        canFreeze: false,
        minSoftCap: parseEther('0.01').toString(),
      },
    ]);
  });

  it('follows a launch paired with a stablecoin, in its own decimals', async () => {
    const symbol = uniqueSymbol();
    const launch = newV3Launch(usdc, symbol, usd('10000'));
    const buyer = randomAddress();
    chain.mine([
      launch.created,
      launch.saleEvent('Contributed', {
        contributor: buyer,
        amount: usd('10000'),
        totalRaised: usd('10000'),
      }),
    ]);
    chain.mine([
      launch.saleEvent('Finalized', {
        pair: randomAddress(),
        liquidityQuote: usd('7000'),
        liquidityTokens: parseEther('407646'),
        liquidityLocked: parseEther('1689'),
        creatorQuote: usd('2950'),
        fee: usd('50'),
        tokensBurned: parseEther('1'),
      }),
      launch.released(usd('983.333333'), parseEther('3333')),
    ]);
    await sync();

    const view = await findLaunch(symbol);
    expect(view).toMatchObject({
      launchpadVersion: 3,
      requiredTier: 0,
      quoteAsset: { symbol: 'USDC', decimals: 6, kind: 'stablecoin' },
      hardCap: usd('10000').toString(),
      totalRaised: usd('10000').toString(),
      status: 'finalized',
      listing: {
        liquidityQuote: usd('7000').toString(),
        creatorQuote: usd('2950').toString(),
        fee: usd('50').toString(),
      },
    });
    const row = await prisma.launch.findUniqueOrThrow({
      where: { id: view.id },
    });
    expect(row.vestingReleasedQuote.toFixed()).toBe(
      usd('983.333333').toString(),
    );
  });

  it('records what a refund paid back, when the issuer took part of it', async () => {
    const symbol = uniqueSymbol();
    const launch = newV3Launch(stock, symbol, parseEther('20'));
    const buyer = randomAddress();
    chain.mine([
      launch.created,
      launch.saleEvent('Contributed', {
        contributor: buyer,
        amount: parseEther('4'),
        totalRaised: parseEther('4'),
      }),
      launch.saleEvent('Refunded', {
        contributor: buyer,
        contribution: parseEther('4'),
        amount: parseEther('3'),
      }),
    ]);
    await sync();

    const view = await findLaunch(symbol);
    expect(view.quoteAsset).toMatchObject({
      symbol: 'NVDA',
      kind: 'stock',
      issuer: 'Robinhood',
      canFreeze: true,
    });
    const contribution = await prisma.launchContribution.findFirstOrThrow({
      where: { launchRowId: view.id },
    });
    expect(contribution.amount.toFixed()).toBe(parseEther('4').toString());
    expect(contribution.refundedAmount?.toFixed()).toBe(
      parseEther('3').toString(),
    );
  });

  it('shows a launch paired with the wrapped native currency as the currency itself', async () => {
    const symbol = uniqueSymbol();
    chain.mine([newV3Launch(weth, symbol, parseEther('10')).created]);
    await sync();

    expect((await findLaunch(symbol)).quoteAsset).toMatchObject({
      address: null,
      symbol: 'TST',
      kind: 'native',
    });
  });

  it('keeps showing the launches of the v2 Launchpad of the same chain', async () => {
    const symbol = uniqueSymbol();
    chain.mine([newV2Launch(v2, symbol)]);
    await sync();

    expect(await findLaunch(symbol)).toMatchObject({
      launchpadVersion: 2,
      quoteAsset: { symbol: 'TST', kind: 'native' },
    });
  });

  it('tells where a ticker is already used, on any chain', async () => {
    const symbol = uniqueSymbol();
    const cancelled = newV3Launch(usdc, symbol, usd('10000'));
    chain.mine([
      newV3Launch(usdc, symbol, usd('10000')).created,
      newV2Launch(otherV2, symbol),
      cancelled.created,
      cancelled.saleEvent('Cancelled', { tokensBurned: parseEther('1000000') }),
    ]);
    await sync();

    const response = await api()
      .get(`/launches/tickers/${symbol.toLowerCase()}`)
      .expect(200);
    expect(response.body.symbol).toBe(symbol);
    // Both created in the same block: in no particular order
    const uses = response.body.launches as { chainKey: string }[];
    expect(uses.map((use) => use.chainKey).sort()).toEqual(
      [chainKey, otherChainKey].sort(),
    );
    expect(uses.find((use) => use.chainKey === otherChainKey)).toMatchObject({
      chainName: 'Other chain',
      status: 'live',
    });

    await api().get('/launches/tickers/NOT-A-TICKER').expect(400);
    await api().get('/launches/tickers/ABCDEFGHIJK').expect(400);
  });
});
