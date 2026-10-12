import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseEther, type Hex } from 'viem';
import type { App } from 'supertest/types.js';
import type { EvmChainConfig } from '../src/config/evm-chains.js';
import {
  creatorVestingEvents,
  launchpadEvents,
  tokenSaleEvents,
} from '../src/launchpad/abi.js';
import { CHAIN_READER_FACTORY } from '../src/launchpad/chain-reader.js';
import { LaunchIndexerService } from '../src/launchpad/launch-indexer.service.js';
import type { LaunchView } from '../src/launchpad/launch-view.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeChain, type FakeEvent } from './fake-chain.js';
import { apiClient, signIn, type TestSession } from './session.js';
import { createEvmWallet } from './wallets.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const randomAddress = () => `0x${randomBytes(20).toString('hex')}` as Hex;
const seconds = (date: Date) => BigInt(Math.floor(date.getTime() / 1000));

// Needs the database from `npm run db:up`. The chain is a fake in memory.
describe('Launchpad (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let indexer: LaunchIndexerService;
  let chainConfig: EvmChainConfig;
  let chain: FakeChain;
  const createdAddresses: string[] = [];
  const previousEnv = {
    EVM_CHAINS: process.env.EVM_CHAINS,
    INDEXER_POLL_MS: process.env.INDEXER_POLL_MS,
  };

  const chainKey = `e2e-${randomBytes(4).toString('hex')}`;
  const launchpad = randomAddress();
  let nextLaunchId = 0;

  const api = (session?: TestSession) => apiClient(app, session);
  const sync = () => indexer.sync(chainConfig, chain);

  const newUser = async () => {
    const wallet = createEvmWallet();
    createdAddresses.push(wallet.address, wallet.address.toLowerCase());
    return { wallet, session: await signIn(app, wallet) };
  };

  /** The events of a launch, built the way the contracts emit them. */
  function newLaunch(
    changes: {
      creator?: Hex;
      name?: string;
      symbol?: string;
      startTime?: Date;
      endTime?: Date;
      hardCap?: bigint;
    } = {},
  ) {
    const launch = {
      launchId: BigInt(nextLaunchId++),
      creator: changes.creator ?? randomAddress(),
      token: randomAddress(),
      sale: randomAddress(),
      vesting: randomAddress(),
      params: {
        name: changes.name ?? 'Void Token',
        symbol: changes.symbol ?? 'VOID',
        totalSupply: parseEther('1000000'),
        softCap: parseEther('2'),
        hardCap: changes.hardCap ?? parseEther('10'),
        minContribution: 0n,
        maxContribution: parseEther('6'),
        startTime: seconds(changes.startTime ?? new Date(Date.now() - HOUR)),
        endTime: seconds(changes.endTime ?? new Date(Date.now() + DAY)),
        creatorAllocationBps: 100,
        liquidityBps: 7000,
        vestingTranches: 12,
      },
      tokensForSale: parseEther('582352'),
      creatorAllocation: parseEther('10000'),
      feeBps: 50,
    };
    const saleEvent = (name: string, args: Record<string, unknown>) =>
      ({ address: launch.sale, abi: tokenSaleEvents, name, args }) as FakeEvent;

    return {
      ...launch,
      created: {
        address: launchpad,
        abi: launchpadEvents,
        name: 'LaunchCreated',
        args: launch,
      } as FakeEvent,
      contributed: (contributor: Hex, amount: string, totalRaised: string) =>
        saleEvent('Contributed', {
          contributor,
          amount: parseEther(amount),
          totalRaised: parseEther(totalRaised),
        }),
      finalized: () =>
        saleEvent('Finalized', {
          pair: randomAddress(),
          liquidityNative: parseEther('7'),
          liquidityTokens: parseEther('407646'),
          liquidityLocked: parseEther('1689'),
          creatorNative: parseEther('2.95'),
          fee: parseEther('0.05'),
          tokensBurned: parseEther('1'),
        }),
      claimed: (contributor: Hex, tokens: string) =>
        saleEvent('Claimed', { contributor, tokens: parseEther(tokens) }),
      refunded: (contributor: Hex, amount: string) =>
        saleEvent('Refunded', { contributor, amount: parseEther(amount) }),
      released: (nativeAmount: string, tokenAmount: string) =>
        ({
          address: launch.vesting,
          abi: creatorVestingEvents,
          name: 'Released',
          args: {
            nativeAmount: parseEther(nativeAmount),
            tokenAmount: parseEther(tokenAmount),
            tranchesVested: 1n,
          },
        }) as FakeEvent,
    };
  }

  const findLaunch = async (
    symbol: string,
    session?: TestSession,
  ): Promise<LaunchView> => {
    const response = await api(session)
      .get(`/launches?chain=${chainKey}&q=${symbol}`)
      .expect(200);
    expect(response.body.items).toHaveLength(1);
    return response.body.items[0];
  };

  const uniqueSymbol = () => `T${randomBytes(4).toString('hex').toUpperCase()}`;

  beforeAll(async () => {
    process.env.EVM_CHAINS = JSON.stringify([
      {
        key: chainKey,
        chainId: 31337,
        name: 'Test chain',
        nativeSymbol: 'TST',
        rpcUrl: 'http://127.0.0.1:1',
        launchpad,
        startBlock: 0,
      },
    ]);
    // The app's own polling stays out of the way; the tests call sync().
    process.env.INDEXER_POLL_MS = String(DAY);

    // The app reads its configuration when it is first imported, so it is
    // imported only now that the variables above are set.
    const { AppModule } = await import('../src/app.module.js');

    chain = new FakeChain();
    chain.mine();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CHAIN_READER_FACTORY)
      .useValue(() => chain)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    indexer = app.get(LaunchIndexerService);
    chainConfig = {
      key: chainKey,
      chainId: 31337,
      name: 'Test chain',
      nativeSymbol: 'TST',
      rpcUrl: 'http://127.0.0.1:1',
      launchpad,
      startBlock: 0,
      confirmations: 0,
    };
  });

  afterAll(async () => {
    await prisma.launch.deleteMany({ where: { chainKey } });
    await prisma.chainEvent.deleteMany({ where: { chainKey } });
    await prisma.chainCursor.deleteMany({ where: { chainKey } });
    await prisma.user.deleteMany({
      where: { wallets: { some: { address: { in: createdAddresses } } } },
    });
    await prisma.authChallenge.deleteMany({
      where: { address: { in: createdAddresses } },
    });
    await app.close();
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe('indexing', () => {
    it('copies a launch from its creation to its listing', async () => {
      const symbol = uniqueSymbol();
      const launch = newLaunch({ symbol });
      const alice = randomAddress();
      const bob = randomAddress();
      const listedAt = new Date(Date.now() - 10 * 60 * 1000);

      chain.mine([launch.created]);
      await sync();
      const fresh = await findLaunch(symbol);
      expect(fresh).toMatchObject({
        type: 'token',
        name: 'Void Token',
        symbol,
        status: 'live',
        chain: {
          key: chainKey,
          chainId: 31337,
          name: 'Test chain',
          nativeSymbol: 'TST',
          launchpad,
        },
        creator: { address: launch.creator, user: null },
        tokenAddress: launch.token,
        saleAddress: launch.sale,
        vestingAddress: launch.vesting,
        totalSupply: parseEther('1000000').toString(),
        softCap: parseEther('2').toString(),
        hardCap: parseEther('10').toString(),
        maxContribution: parseEther('6').toString(),
        minContribution: '0',
        totalRaised: '0',
        contributorCount: 0,
        creatorAllocationPercent: 1,
        liquidityPercent: 70,
        feePercent: 0.5,
        vestingMonths: 12,
        listing: null,
        finalizeBy: null,
        myContribution: null,
      });

      chain.mine([launch.contributed(alice, '4', '4')]);
      chain.mine([
        launch.contributed(bob, '4', '8'),
        launch.contributed(alice, '2', '10'),
      ]);
      await sync();
      const soldOut = await findLaunch(symbol);
      expect(soldOut).toMatchObject({
        status: 'succeeded',
        totalRaised: parseEther('10').toString(),
        contributorCount: 2,
      });
      expect(soldOut.finalizeBy).toEqual(expect.any(String));

      chain.mine([launch.finalized()], listedAt);
      chain.mine([
        launch.claimed(alice, '349411'),
        launch.released('0.24', '833'),
      ]);
      await sync();
      const listed = await findLaunch(symbol);
      expect(listed).toMatchObject({
        status: 'finalized',
        finalizeBy: null,
        listing: {
          listedAt: new Date(
            Math.floor(listedAt.getTime() / 1000) * 1000,
          ).toISOString(),
          liquidityNative: parseEther('7').toString(),
          creatorNative: parseEther('2.95').toString(),
          fee: parseEther('0.05').toString(),
        },
      });

      const row = await prisma.launch.findUniqueOrThrow({
        where: { id: listed.id },
        include: { contributions: { orderBy: { amount: 'desc' } } },
      });
      expect(row.vestingReleasedNative.toFixed()).toBe(
        parseEther('0.24').toString(),
      );
      expect(
        row.contributions.map((c) => [
          c.contributor,
          c.amount.toFixed(),
          c.claimedTokens?.toFixed() ?? null,
        ]),
      ).toEqual([
        [alice, parseEther('6').toString(), parseEther('349411').toString()],
        [bob, parseEther('4').toString(), null],
      ]);
    });

    it('indexes a launch created and contributed to in the same batch', async () => {
      const symbol = uniqueSymbol();
      const launch = newLaunch({ symbol });

      chain.mine([
        launch.created,
        launch.contributed(randomAddress(), '3', '3'),
      ]);
      await sync();

      expect(await findLaunch(symbol)).toMatchObject({
        totalRaised: parseEther('3').toString(),
        contributorCount: 1,
      });
    });

    it('records a refund of a failed sale', async () => {
      const symbol = uniqueSymbol();
      const launch = newLaunch({
        symbol,
        startTime: new Date(Date.now() - 2 * DAY),
        endTime: new Date(Date.now() - DAY),
      });
      const { wallet, session } = await newUser();
      const contributor = wallet.address.toLowerCase() as Hex;

      chain.mine([launch.created, launch.contributed(contributor, '1', '1')]);
      chain.mine([launch.refunded(contributor, '1')]);
      await sync();

      const failed = await findLaunch(symbol, session);
      expect(failed.status).toBe('failed');
      expect(failed.myContribution).toEqual({
        amount: parseEther('1').toString(),
        claimedTokens: null,
        refundedAmount: parseEther('1').toString(),
      });
    });

    it('changes nothing when the same blocks are read twice', async () => {
      const symbol = uniqueSymbol();
      const launch = newLaunch({ symbol });
      const firstBlock = chain.mine([
        launch.created,
        launch.contributed(randomAddress(), '3', '3'),
      ]);
      chain.mine([launch.contributed(randomAddress(), '2', '5')]);
      await sync();
      const before = await findLaunch(symbol);
      const eventsBefore = await prisma.chainEvent.count({
        where: { chainKey },
      });

      // As if the app had crashed before saving how far it got.
      const previous = await chain.getBlock(BigInt(firstBlock - 1));
      await prisma.chainCursor.update({
        where: { chainKey },
        data: { lastBlock: firstBlock - 1, lastHash: previous.hash },
      });
      expect(await sync()).toBe(2);

      expect(await findLaunch(symbol)).toEqual(before);
      expect(await prisma.chainEvent.count({ where: { chainKey } })).toBe(
        eventsBefore,
      );
      expect(await sync()).toBe(0);
    });

    it('ignores a launch announced by any contract but the launchpad', async () => {
      const symbol = uniqueSymbol();
      const launch = newLaunch({ symbol });

      chain.mine([{ ...launch.created, address: randomAddress() }]);
      await sync();

      const response = await api()
        .get(`/launches?chain=${chainKey}&q=${symbol}`)
        .expect(200);
      expect(response.body.items).toEqual([]);
    });

    it('waits for the confirmations of the chain before reading a block', async () => {
      const symbol = uniqueSymbol();
      const launch = newLaunch({ symbol });
      const patient = { ...chainConfig, confirmations: 2 };
      await sync();

      chain.mine([launch.created]);
      chain.mine();
      await indexer.sync(patient, chain);
      const early = await api()
        .get(`/launches?chain=${chainKey}&q=${symbol}`)
        .expect(200);
      expect(early.body.items).toEqual([]);

      chain.mine();
      await indexer.sync(patient, chain);
      expect(await findLaunch(symbol)).toMatchObject({ symbol });
      await sync();
    });

    it('stops when a block it had read is replaced', async () => {
      await sync();
      chain.replaceBlock(chain.height);

      await expect(sync()).rejects.toThrow(/was replaced/);

      // Put the test chain back in step for whatever runs next.
      const block = await chain.getBlock(BigInt(chain.height));
      await prisma.chainCursor.update({
        where: { chainKey },
        data: { lastHash: block.hash },
      });
    });
  });

  describe('listing', () => {
    it('filters by status as time passes, by creator and by text', async () => {
      const creator = randomAddress();
      const tag = uniqueSymbol();
      const now = Date.now();
      const upcoming = newLaunch({
        creator,
        symbol: `${tag}A`,
        startTime: new Date(now + DAY),
        endTime: new Date(now + 2 * DAY),
      });
      const live = newLaunch({ creator, symbol: `${tag}B`, name: 'Fauna' });
      const soldOut = newLaunch({
        creator,
        symbol: `${tag}C`,
        hardCap: parseEther('5'),
      });
      const over = newLaunch({
        creator,
        symbol: `${tag}D`,
        startTime: new Date(now - 2 * DAY),
        endTime: new Date(now - DAY),
      });
      chain.mine([
        upcoming.created,
        live.created,
        soldOut.created,
        over.created,
      ]);
      chain.mine([soldOut.contributed(randomAddress(), '5', '5')]);
      await sync();

      const symbols = async (query: string) => {
        const response = await api()
          .get(`/launches?chain=${chainKey}&creator=${creator}&${query}`)
          .expect(200);
        return response.body.items.map((item: LaunchView) => item.symbol);
      };

      // Newest first.
      expect(await symbols('')).toEqual([
        `${tag}D`,
        `${tag}C`,
        `${tag}B`,
        `${tag}A`,
      ]);
      expect(await symbols('status=upcoming')).toEqual([`${tag}A`]);
      expect(await symbols('status=live')).toEqual([`${tag}B`]);
      expect(await symbols('status=ended')).toEqual([`${tag}D`, `${tag}C`]);
      expect(await symbols('q=fauna')).toEqual([`${tag}B`]);
      expect(await symbols(`q=${tag.toLowerCase()}c`)).toEqual([`${tag}C`]);

      const firstPage = await api()
        .get(`/launches?chain=${chainKey}&creator=${creator}&limit=3`)
        .expect(200);
      const secondPage = await api()
        .get(
          `/launches?chain=${chainKey}&creator=${creator}&limit=3&cursor=${firstPage.body.nextCursor}`,
        )
        .expect(200);
      expect(
        secondPage.body.items.map((item: LaunchView) => item.symbol),
      ).toEqual([`${tag}A`]);
      expect(secondPage.body.nextCursor).toBeNull();
    });

    it('rejects invalid filters', async () => {
      await api().get('/launches?status=finished').expect(400);
      await api().get('/launches?creator=0x123').expect(400);
      await api().get('/launches?limit=51').expect(400);
    });

    it('lists the configured chains with their launchpad contract', async () => {
      const response = await api().get('/launches/chains').expect(200);
      expect(response.body.items).toEqual([
        {
          key: chainKey,
          chainId: 31337,
          name: 'Test chain',
          nativeSymbol: 'TST',
          launchpad,
        },
      ]);
    });

    it('answers 404 for a launch that does not exist and 400 for a bad id', async () => {
      await api()
        .get('/launches/01920000-0000-7000-8000-000000000000')
        .expect(404);
      await api().get('/launches/nope').expect(400);
    });
  });

  describe('the creator of a launch', () => {
    it('is shown with their Somewhere profile and can describe the launch', async () => {
      const { wallet, session } = await newUser();
      const other = await newUser();
      const symbol = uniqueSymbol();
      const launch = newLaunch({
        symbol,
        creator: wallet.address.toLowerCase() as Hex,
      });
      chain.mine([launch.created]);
      await sync();
      const { id, creator } = await findLaunch(symbol);
      expect(creator.user).toMatchObject({ handle: session.user.handle });

      const changes = {
        description: '  Governance token for Void Protocol holders.  ',
        image: 'https://example.com/void.png',
      };
      await api().patch(`/launches/${id}`).send(changes).expect(401);
      await api(other.session)
        .patch(`/launches/${id}`)
        .send(changes)
        .expect(403);
      await api(session)
        .patch(`/launches/${id}`)
        .send({ hardCap: '1' })
        .expect(400);

      const edited = await api(session)
        .patch(`/launches/${id}`)
        .send(changes)
        .expect(200);
      expect(edited.body).toMatchObject({
        description: 'Governance token for Void Protocol holders.',
        image: 'https://example.com/void.png',
        // Nothing that lives on chain can be touched this way.
        hardCap: parseEther('10').toString(),
      });

      const cleared = await api(session)
        .patch(`/launches/${id}`)
        .send({ image: null })
        .expect(200);
      expect(cleared.body).toMatchObject({
        description: 'Governance token for Void Protocol holders.',
        image: null,
      });
    });
  });
});
