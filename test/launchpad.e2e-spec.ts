import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import ajvModule from 'ajv';
import ajvFormatsModule from 'ajv-formats';
import sharp from 'sharp';
import { getAddress, parseEther, type Hex } from 'viem';
import type { App } from 'supertest/types.js';
import type { LaunchpadChainConfig } from '../src/config/chains.js';
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

// Both are CommonJS packages: their export is under `default`
const Ajv = ajvModule.default;
const addFormats = ajvFormatsModule.default;

// The official schema of the token list format, from @uniswap/token-lists
const tokenListSchema = createRequire(import.meta.url)(
  '@uniswap/token-lists/src/tokenlist.schema.json',
) as object;

/** A small PNG of one colour, so each colour is a different file. */
const pngOf = (background: string) =>
  sharp({ create: { width: 4, height: 4, channels: 3, background } })
    .png()
    .toBuffer();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const randomAddress = () => `0x${randomBytes(20).toString('hex')}` as Hex;
const seconds = (date: Date) => BigInt(Math.floor(date.getTime() / 1000));

// Needs the database from `npm run db:up`. The chain is a fake in memory.
describe('Launchpad (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let indexer: LaunchIndexerService;
  let chainConfig: LaunchpadChainConfig;
  let chain: FakeChain;
  const createdAddresses: string[] = [];
  const previousEnv = {
    CHAINS: process.env.CHAINS,
    INDEXER_POLL_MS: process.env.INDEXER_POLL_MS,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    PUBLIC_API_URL: process.env.PUBLIC_API_URL,
  };
  let uploadDir: string;

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
      cancelled: () =>
        saleEvent('Cancelled', { tokensBurned: parseEther('1000000') }),
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

  const uploadImage = async (session: TestSession, colour: string) => {
    const response = await api(session)
      .post('/uploads/images')
      .attach('file', await pngOf(colour), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);
    return response.body.url as string;
  };

  const notificationsOf = async (session: TestSession) =>
    (await api(session).get('/notifications').expect(200)).body.items;

  const uniqueSymbol = () => `T${randomBytes(4).toString('hex').toUpperCase()}`;

  beforeAll(async () => {
    process.env.CHAINS = JSON.stringify([
      {
        key: chainKey,
        family: 'evm',
        chainId: 31337,
        name: 'Test chain',
        nativeCurrency: { symbol: 'TST', name: 'Test coin', decimals: 18 },
        rpcUrl: 'http://127.0.0.1:1',
        launchpad,
        startBlock: 0,
      },
    ]);
    // The app's own polling stays out of the way; the tests call sync().
    process.env.INDEXER_POLL_MS = String(DAY);
    uploadDir = await mkdtemp(join(tmpdir(), 'somewhere-launch-uploads-'));
    process.env.UPLOAD_DIR = uploadDir;
    process.env.PUBLIC_API_URL = 'https://api.test';

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
      family: 'evm',
      chainId: 31337,
      name: 'Test chain',
      nativeCurrency: { symbol: 'TST', name: 'Test coin', decimals: 18 },
      rpcUrl: 'http://127.0.0.1:1',
      launchpads: [{ address: launchpad, version: 2, startBlock: 0 }],
      assets: [],
      confirmations: 0,
      logBlockRange: 2000,
    };
  });

  afterAll(async () => {
    // What people added has no foreign key to the launch: deleted by id
    const launchIds = (
      await prisma.launch.findMany({
        where: { chainKey },
        select: { id: true },
      })
    ).map((launch) => launch.id);
    await prisma.launchProfile.deleteMany({
      where: { launchId: { in: launchIds } },
    });
    await prisma.reaction.deleteMany({
      where: { launchId: { in: launchIds } },
    });
    await prisma.post.deleteMany({ where: { launchId: { in: launchIds } } });
    await prisma.pendingLaunchDetails.deleteMany({ where: { chainKey } });
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
    await rm(uploadDir, { recursive: true, force: true });
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
          family: 'evm',
          chainId: 31337,
          name: 'Test chain',
          nativeCurrency: { symbol: 'TST', name: 'Test coin', decimals: 18 },
          launchpad,
        },
        // Sold for the chain's own currency, with its decimals
        quoteAsset: {
          chainKey,
          address: null,
          symbol: 'TST',
          decimals: 18,
          kind: 'native',
        },
        tokenDecimals: 18,
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
          liquidityQuote: parseEther('7').toString(),
          creatorQuote: parseEther('2.95').toString(),
          fee: parseEther('0.05').toString(),
        },
      });

      const row = await prisma.launch.findUniqueOrThrow({
        where: { id: listed.id },
        include: { contributions: { orderBy: { amount: 'desc' } } },
      });
      expect(row.vestingReleasedQuote.toFixed()).toBe(
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

    it('records a sale its creator cancelled before it started', async () => {
      const symbol = uniqueSymbol();
      const now = Date.now();
      const launch = newLaunch({
        symbol,
        startTime: new Date(now + DAY),
        endTime: new Date(now + 2 * DAY),
      });
      chain.mine([launch.created]);
      chain.mine([launch.cancelled()]);
      await sync();

      const cancelled = await findLaunch(symbol);
      expect(cancelled.status).toBe('cancelled');
      expect(cancelled.cancelledAt).not.toBeNull();
      expect(cancelled.listing).toBeNull();

      const inGroup = async (status: string) => {
        const response = await api()
          .get(`/launches?chain=${chainKey}&q=${symbol}&status=${status}`)
          .expect(200);
        return response.body.items.length;
      };
      expect(await inGroup('upcoming')).toBe(0);
      expect(await inGroup('live')).toBe(0);
      expect(await inGroup('ended')).toBe(1);
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
        where: { chainKey_launchpad: { chainKey, launchpad } },
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

    it('reads one block per request when the node only allows that', async () => {
      const symbol = uniqueSymbol();
      const launch = newLaunch({ symbol });
      const narrow = { ...chainConfig, logBlockRange: 1 };
      const requested: [bigint, bigint][] = [];
      const reader = {
        getBlockNumber: () => chain.getBlockNumber(),
        getBlock: (n: bigint) => chain.getBlock(n),
        getWrappedNative: (address: Hex) => chain.getWrappedNative(address),
        getTokenMetadata: (address: Hex) => chain.getTokenMetadata(address),
        getLogs: (range: Parameters<FakeChain['getLogs']>[0]) => {
          requested.push([range.fromBlock, range.toBlock]);
          return chain.getLogs(range);
        },
      };
      await sync();

      chain.mine([launch.created]);
      chain.mine([launch.contributed(randomAddress(), '1', '1')]);
      chain.mine([launch.contributed(randomAddress(), '2', '3')]);
      expect(await indexer.sync(narrow, reader)).toBe(3);

      expect(requested.every(([from, to]) => from === to)).toBe(true);
      expect(await findLaunch(symbol)).toMatchObject({
        totalRaised: parseEther('3').toString(),
        contributorCount: 2,
      });
    });

    it('stops when a block it had read is replaced', async () => {
      await sync();
      chain.replaceBlock(chain.height);

      await expect(sync()).rejects.toThrow(/was replaced/);

      // Put the test chain back in step for whatever runs next.
      const block = await chain.getBlock(BigInt(chain.height));
      await prisma.chainCursor.update({
        where: { chainKey_launchpad: { chainKey, launchpad } },
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
          family: 'evm',
          chainId: 31337,
          name: 'Test chain',
          nativeCurrency: { symbol: 'TST', name: 'Test coin', decimals: 18 },
          launchpad,
          launchpadVersion: 2,
          // What a launch there can be sold for, and the least it must raise
          quoteAssets: [
            {
              chainKey,
              address: null,
              symbol: 'TST',
              name: 'Test coin',
              decimals: 18,
              kind: 'native',
              issuer: null,
              canFreeze: false,
              minSoftCap: parseEther('0.01').toString(),
            },
          ],
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
    /** A launch of a new user that has not started yet. */
    async function ownLaunch(startsIn = DAY) {
      const { wallet, session } = await newUser();
      const symbol = uniqueSymbol();
      const now = Date.now();
      chain.mine([
        newLaunch({
          symbol,
          creator: wallet.address.toLowerCase() as Hex,
          startTime: new Date(now + startsIn),
          endTime: new Date(now + startsIn + DAY),
        }).created,
      ]);
      await sync();
      return { session, launch: await findLaunch(symbol) };
    }

    it('is shown with their Somewhere profile', async () => {
      const { session, launch } = await ownLaunch();
      expect(launch.creator.user).toMatchObject({
        handle: session.user.handle,
      });
      expect(launch.detailsSetAt).toBeNull();
    });

    it('describes the launch once, before the sale starts, with an image uploaded here', async () => {
      const { session, launch } = await ownLaunch();
      const other = await newUser();
      const image = await uploadImage(session, '#5142fc');
      const details = { description: '  Credits for the arcade.  ', image };
      const put = (as: TestSession | undefined, body: object) =>
        api(as).put(`/launches/${launch.id}/details`).send(body);

      await put(undefined, details).expect(401);
      await put(other.session, details).expect(403);
      await put(session, { ...details, hardCap: '1' }).expect(400);
      await put(session, {
        ...details,
        image: 'https://example.com/void.png',
      }).expect(400);
      await put(session, {
        ...details,
        image: `https://api.test/uploads/${'a'.repeat(64)}.png`,
      }).expect(400);

      const set = await put(session, details).expect(200);
      expect(set.body).toMatchObject({
        description: 'Credits for the arcade.',
        image,
        detailsSetAt: expect.any(String),
        // Nothing that lives on chain can be touched this way.
        hardCap: parseEther('10').toString(),
      });

      // Never again, not even the description alone
      await put(session, { description: 'Second thoughts.' }).expect(409);
      expect((await findLaunch(launch.symbol)).description).toBe(
        'Credits for the arcade.',
      );
    });

    it('cannot describe a launch whose sale has started', async () => {
      const { session, launch } = await ownLaunch(-HOUR);
      expect(launch.status).toBe('live');
      await api(session)
        .put(`/launches/${launch.id}/details`)
        .send({ description: 'Too late.' })
        .expect(409);
    });

    it('sends the details with the transaction, before the launch is indexed', async () => {
      const { wallet, session } = await newUser();
      const intruder = await newUser();
      const symbol = uniqueSymbol();
      const now = Date.now();
      const launch = newLaunch({
        symbol,
        creator: wallet.address.toLowerCase() as Hex,
        startTime: new Date(now + DAY),
        endTime: new Date(now + 2 * DAY),
      });
      const txHash = chain.nextTxHash();
      const image = await uploadImage(session, '#00aa88');
      const send = (as: TestSession, description: string) =>
        api(as)
          .post('/launches/details')
          .send({ chain: chainKey, txHash, description, image });

      // Someone else claims the same transaction first: it does not count
      await send(intruder.session, 'Not mine to say.').expect(202);
      const waiting = await send(session, 'Sent before it was indexed.').expect(
        202,
      );
      expect(waiting.body).toEqual({ launch: null });
      await api(session)
        .post('/launches/details')
        .send({ chain: 'nope', txHash, description: '' })
        .expect(400);

      chain.mine([launch.created]);
      await sync();
      const indexed = await findLaunch(symbol);
      expect(indexed).toMatchObject({
        description: 'Sent before it was indexed.',
        image,
        detailsSetAt: expect.any(String),
      });
      expect(
        await prisma.pendingLaunchDetails.count({ where: { txHash } }),
      ).toBe(0);

      // Once indexed, the same route answers with the launch, or refuses
      await send(session, 'Again.').expect(409);
    });
  });

  describe('purchases', () => {
    it('tell the creator who bought, and the buyer what they bought', async () => {
      const creator = await newUser();
      const buyer = await newUser();
      const symbol = uniqueSymbol();
      const launch = newLaunch({
        symbol,
        creator: creator.wallet.address.toLowerCase() as Hex,
      });
      const anonymous = randomAddress();
      chain.mine([launch.created]);
      chain.mine([
        launch.contributed(
          buyer.wallet.address.toLowerCase() as Hex,
          '0.5',
          '0.5',
        ),
        launch.contributed(anonymous, '1', '1.5'),
      ]);
      await sync();

      const creatorItems = await notificationsOf(creator.session);
      expect(creatorItems).toHaveLength(2);
      // 0.5 of a 10 hard cap buys 5% of the 582,352 tokens for sale
      const halfEthTokens = parseEther('29117.6').toString();
      expect(creatorItems[1]).toMatchObject({
        type: 'launch_purchase',
        actors: [{ handle: buyer.session.user.handle }],
        actorAddress: null,
        launch: {
          symbol,
          tokenDecimals: 18,
          quoteAsset: { symbol: 'TST', decimals: 18 },
        },
        purchase: {
          quoteAmount: parseEther('0.5').toString(),
          tokenAmount: halfEthTokens,
        },
      });
      expect(creatorItems[0]).toMatchObject({
        type: 'launch_purchase',
        actors: [],
        actorAddress: anonymous.toLowerCase(),
      });

      const buyerItems = await notificationsOf(buyer.session);
      expect(buyerItems).toEqual([
        expect.objectContaining({
          type: 'purchase',
          actors: [],
          launch: expect.objectContaining({ symbol }),
          purchase: {
            quoteAmount: parseEther('0.5').toString(),
            tokenAmount: halfEthTokens,
          },
        }),
      ]);
    });
  });

  describe('the conversation of a launch', () => {
    it('collects comments and replies, and tells the creator about each', async () => {
      const creator = await newUser();
      const fan = await newUser();
      const critic = await newUser();
      const symbol = uniqueSymbol();
      chain.mine([
        newLaunch({
          symbol,
          creator: creator.wallet.address.toLowerCase() as Hex,
        }).created,
      ]);
      await sync();
      const { id } = await findLaunch(symbol);

      const comment = await api(fan.session)
        .post('/posts')
        .send({ text: 'Looks solid.', launchId: id })
        .expect(201);
      expect(comment.body.launch).toEqual({
        id,
        name: 'Void Token',
        symbol,
        image: null,
      });
      const reply = await api(critic.session)
        .post('/posts')
        .send({ text: 'Not so sure.', replyToId: comment.body.id })
        .expect(201);
      // A reply belongs to the launch of what it answers
      expect(reply.body.launch?.id).toBe(id);
      await api(fan.session)
        .post('/posts')
        .send({
          text: 'Twice?',
          launchId: id,
          replyToId: comment.body.id,
        })
        .expect(400);
      await api(fan.session)
        .post('/posts')
        .send({
          text: 'Lost.',
          launchId: '01920000-0000-7000-8000-000000000000',
        })
        .expect(404);

      const comments = await api().get(`/launches/${id}/comments`).expect(200);
      expect(
        comments.body.items.map((post: { id: string }) => post.id),
      ).toEqual([comment.body.id]);

      const told = await notificationsOf(creator.session);
      expect(
        told.map((item: { type: string; post: { id: string } }) => [
          item.type,
          item.post.id,
        ]),
      ).toEqual([
        ['launch_comment', reply.body.id],
        ['launch_comment', comment.body.id],
      ]);
      // The commenter hears about the reply to their comment
      expect((await notificationsOf(fan.session))[0]).toMatchObject({
        type: 'reply',
      });
    });

    it('takes emoji reactions on the launch and on its comments', async () => {
      const creator = await newUser();
      const fan = await newUser();
      const symbol = uniqueSymbol();
      chain.mine([
        newLaunch({
          symbol,
          creator: creator.wallet.address.toLowerCase() as Hex,
        }).created,
      ]);
      await sync();
      const { id } = await findLaunch(symbol);
      const count = (
        reactions: { kind: string; count: number; reacted: boolean }[],
        kind: string,
      ) => reactions.find((reaction) => reaction.kind === kind);

      await api(fan.session).put(`/launches/${id}/reactions/heart`).expect(400);
      await api().put(`/launches/${id}/reactions/rocket`).expect(401);
      await api(fan.session)
        .put(`/launches/${id}/reactions/rocket`)
        .expect(200);
      const both = await api(fan.session)
        .put(`/launches/${id}/reactions/gem`)
        .expect(200);
      // Reacting twice with the same emoji changes nothing
      await api(fan.session).put(`/launches/${id}/reactions/gem`).expect(200);
      expect(count(both.body.reactions, 'rocket')).toEqual({
        kind: 'rocket',
        count: 1,
        reacted: true,
      });
      expect(count(both.body.reactions, 'gem')?.count).toBe(1);
      const seenByCreator = await api(creator.session)
        .get(`/launches/${id}`)
        .expect(200);
      expect(count(seenByCreator.body.reactions, 'rocket')).toEqual({
        kind: 'rocket',
        count: 1,
        reacted: false,
      });

      const comment = await api(creator.session)
        .post('/posts')
        .send({ text: 'Thanks for the support!', launchId: id })
        .expect(201);
      const reacted = await api(fan.session)
        .put(`/posts/${comment.body.id}/reactions/fire`)
        .expect(200);
      expect(count(reacted.body.reactions, 'fire')).toEqual({
        kind: 'fire',
        count: 1,
        reacted: true,
      });

      const told = await notificationsOf(creator.session);
      expect(
        told.map(
          (item: {
            type: string;
            reaction: string;
            post: { id: string } | null;
          }) => [item.type, item.reaction, item.post?.id ?? null],
        ),
      ).toEqual([
        ['reaction', 'fire', comment.body.id],
        ['reaction', 'gem', null],
        ['reaction', 'rocket', null],
      ]);

      await api(fan.session)
        .delete(`/launches/${id}/reactions/gem`)
        .expect(200);
      await api(fan.session)
        .delete(`/posts/${comment.body.id}/reactions/fire`)
        .expect(200);
      const after = await notificationsOf(creator.session);
      expect(after.map((item: { reaction: string }) => item.reaction)).toEqual([
        'rocket',
      ]);
    });
  });

  describe('the token list', () => {
    it('lists every listed token in the standard format, and only those', async () => {
      const { wallet, session } = await newUser();
      const creator = wallet.address.toLowerCase() as Hex;
      const withImage = newLaunch({ creator, symbol: uniqueSymbol() });
      const withoutImage = newLaunch({ creator, symbol: uniqueSymbol() });
      const stillLive = newLaunch({ creator, symbol: uniqueSymbol() });
      const oddSymbol = newLaunch({ creator, symbol: 'TWO WORDS' });
      chain.mine([
        withImage.created,
        withoutImage.created,
        stillLive.created,
        oddSymbol.created,
      ]);
      chain.mine([
        withImage.finalized(),
        withoutImage.finalized(),
        oddSymbol.finalized(),
      ]);
      await sync();

      const before = (await api().get('/launches/token-list').expect(200)).body;
      const { id } = await findLaunch(withImage.params.symbol);
      const image = await uploadImage(session, '#00ff00');
      // Details can only be set before the start: this one is set directly
      await prisma.launchProfile.create({
        data: { launchId: id, imageUrl: image },
      });

      const list = (await api().get('/launches/token-list').expect(200)).body;
      const validate = addFormats(new Ajv({ allErrors: true })).compile(
        tokenListSchema,
      );
      expect(validate(list), JSON.stringify(validate.errors)).toBe(true);

      const ours = [withImage, withoutImage, stillLive, oddSymbol].map(
        (launch) => getAddress(launch.token),
      );
      expect(
        list.tokens.filter((token: { address: string }) =>
          ours.includes(token.address as Hex),
        ),
      ).toEqual([
        {
          chainId: 31337,
          address: getAddress(withImage.token),
          name: 'Void Token',
          symbol: withImage.params.symbol,
          decimals: 18,
          logoURI: image,
        },
        {
          chainId: 31337,
          address: getAddress(withoutImage.token),
          name: 'Void Token',
          symbol: withoutImage.params.symbol,
          decimals: 18,
        },
      ]);

      // Adding an image is a change to a token: the patch number goes up
      expect(list.version.minor).toBe(before.version.minor);
      expect(list.version.patch).toBe(before.version.patch + 1);
    });
  });
  describe('a change of contract', () => {
    it('reads the new Launchpad on its own, deleting nothing', async () => {
      const symbol = uniqueSymbol();
      chain.mine([newLaunch({ symbol }).created]);
      await sync();
      const before = await prisma.launch.count({ where: { chainKey } });

      // Another contract on the same chain, with a launch of its own
      const otherLaunchpad = randomAddress();
      const otherSymbol = uniqueSymbol();
      chain.mine([
        {
          address: otherLaunchpad,
          abi: launchpadEvents,
          name: 'LaunchCreated',
          args: newLaunch({ symbol: otherSymbol }),
        } as FakeEvent,
      ]);
      const other: LaunchpadChainConfig = {
        ...chainConfig,
        launchpads: [
          {
            address: otherLaunchpad.toLowerCase() as Hex,
            version: 2,
            startBlock: 0,
          },
        ],
      };
      await indexer.sync(other, chain);

      // Its launch is stored, the previous ones are all still there, and the
      // API keeps showing the configured contract
      expect(await prisma.launch.count({ where: { chainKey } })).toBe(
        before + 1,
      );
      expect((await findLaunch(symbol)).symbol).toBe(symbol);

      // Back to the configured one: it goes on from where it was, and the
      // launch of the other contract stays out of sight
      await sync();
      const hidden = await api()
        .get(`/launches?chain=${chainKey}&q=${otherSymbol}`)
        .expect(200);
      expect(hidden.body.items).toEqual([]);
      expect(await prisma.launch.count({ where: { chainKey } })).toBe(
        before + 1,
      );
    });
  });

  // Last: it deletes the copy of the test chain
  describe('reading the chain again', () => {
    it('keeps everything people added, attached to the same launches', async () => {
      const creator = await newUser();
      const fan = await newUser();
      const now = Date.now();
      const upcoming = newLaunch({
        symbol: uniqueSymbol(),
        creator: creator.wallet.address.toLowerCase() as Hex,
        startTime: new Date(now + DAY),
        endTime: new Date(now + 2 * DAY),
      });
      const live = newLaunch({
        symbol: uniqueSymbol(),
        creator: creator.wallet.address.toLowerCase() as Hex,
      });
      chain.mine([upcoming.created, live.created]);
      chain.mine([
        live.contributed(fan.wallet.address.toLowerCase() as Hex, '1', '1'),
      ]);
      await sync();

      const { id } = await findLaunch(upcoming.params.symbol);
      const image = await uploadImage(creator.session, '#123456');
      await api(creator.session)
        .put(`/launches/${id}/details`)
        .send({ description: 'Stays forever.', image })
        .expect(200);
      const comment = await api(fan.session)
        .post('/posts')
        .send({ text: 'Count me in.', launchId: id })
        .expect(201);
      await api(fan.session).put(`/launches/${id}/reactions/gem`).expect(200);
      const told = async (session: TestSession) =>
        (await notificationsOf(session)).map(
          (item: { type: string }) => item.type,
        );
      const creatorBefore = await told(creator.session);
      const fanBefore = await told(fan.session);

      // What `npm run launchpad:reset` deletes: the copy of the chain
      await prisma.launch.deleteMany({ where: { chainKey } });
      await prisma.chainEvent.deleteMany({ where: { chainKey } });
      await prisma.chainCursor.deleteMany({ where: { chainKey } });
      await sync();

      const again = await findLaunch(upcoming.params.symbol, fan.session);
      expect(again).toMatchObject({
        id,
        description: 'Stays forever.',
        image,
        detailsSetAt: expect.any(String),
      });
      expect(
        again.reactions.find((reaction) => reaction.kind === 'gem'),
      ).toEqual({ kind: 'gem', count: 1, reacted: true });
      const comments = await api().get(`/launches/${id}/comments`).expect(200);
      expect(
        comments.body.items.map((post: { id: string }) => post.id),
      ).toEqual([comment.body.id]);
      expect(comments.body.items[0].launch.id).toBe(id);

      // The purchase was read twice and told once
      expect(await told(creator.session)).toEqual(creatorBefore);
      expect(await told(fan.session)).toEqual(fanBefore);
      expect(fanBefore).toContain('purchase');
    });
  });
});
