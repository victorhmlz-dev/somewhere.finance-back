import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseEther, parseUnits, type Hex } from 'viem';
import type { App } from 'supertest/types.js';
import {
  BALANCE_READER_FACTORY,
  type BalanceReader,
} from '../src/balances/balance-reader.js';
import { PRICE_SOURCE } from '../src/balances/prices.service.js';
import { launchRowId } from '../src/launchpad/launch-id.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { apiClient, signIn } from './session.js';
import { createEvmWallet } from './wallets.js';

const randomAddress = () => `0x${randomBytes(20).toString('hex')}` as Hex;
const usd = (amount: string) => parseUnits(amount, 6);

// Needs the database from `npm run db:up`. Chains and prices are fakes.
describe('Balances (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = randomBytes(4).toString('hex');
  const chainKey = `bal-${suffix}`;
  const deadChainKey = `bal-dead-${suffix}`;
  const launchpad = randomAddress().toLowerCase() as Hex;
  const usdc = randomAddress().toLowerCase() as Hex;
  const launchToken = randomAddress().toLowerCase() as Hex;
  const pair = randomAddress().toLowerCase() as Hex;
  const createdAddresses: string[] = [];
  const previousChains = process.env.CHAINS;

  // What the fake chain holds, by "token:owner" ("native:owner" for ETH)
  const holdings = new Map<string, bigint>();
  let gasPrice = parseUnits('2', 9); // 2 gwei
  const reader: BalanceReader = {
    getNativeBalance: async (owner) =>
      holdings.get(`native:${owner.toLowerCase()}`) ?? 0n,
    getTokenBalance: async (token, owner) =>
      holdings.get(`${token.toLowerCase()}:${owner.toLowerCase()}`) ?? 0n,
    getGasPrice: async () => gasPrice,
    // 1,000 tokens against 50 USDC: 0.05 USDC per token
    getPairReserves: async () => ({
      token0: launchToken,
      reserve0: parseEther('1000'),
      reserve1: usd('50'),
    }),
  };
  const deadReader: BalanceReader = {
    getNativeBalance: () => Promise.reject(new Error('node down')),
    getTokenBalance: () => Promise.reject(new Error('node down')),
    getGasPrice: () => Promise.reject(new Error('node down')),
    getPairReserves: () => Promise.reject(new Error('node down')),
  };

  const chainConfig = (key: string) => ({
    key,
    family: 'evm',
    chainId: key === chainKey ? 31337 : 31338,
    name: key === chainKey ? 'Test chain' : 'Dead chain',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      priceId: 'ethereum',
    },
    rpcUrl: 'http://127.0.0.1:1',
    launchpads: [{ address: launchpad, version: 3, startBlock: 0 }],
    assets: [
      { address: usdc, kind: 'stablecoin', issuer: 'Circle', canFreeze: true },
    ],
  });

  beforeAll(async () => {
    process.env.CHAINS = JSON.stringify([
      chainConfig(chainKey),
      chainConfig(deadChainKey),
    ]);
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BALANCE_READER_FACTORY)
      .useValue((chain: { key: string }) =>
        chain.key === chainKey ? reader : deadReader,
      )
      .overrideProvider(PRICE_SOURCE)
      .useValue(
        async (ids: string[]) =>
          new Map(
            ids.filter((id) => id === 'ethereum').map((id) => [id, 2000]),
          ),
      )
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.asset.create({
      data: {
        chainKey,
        address: usdc,
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        kind: 'stablecoin',
        canFreeze: true,
      },
    });
  });

  afterAll(async () => {
    const chainKeys = [chainKey, deadChainKey];
    await prisma.launchContribution.deleteMany({
      where: { launch: { chainKey: { in: chainKeys } } },
    });
    await prisma.launch.deleteMany({ where: { chainKey: { in: chainKeys } } });
    await prisma.asset.deleteMany({ where: { chainKey: { in: chainKeys } } });
    await prisma.user.deleteMany({
      where: { wallets: { some: { address: { in: createdAddresses } } } },
    });
    await prisma.authChallenge.deleteMany({
      where: { address: { in: createdAddresses } },
    });
    await app.close();
    if (previousChains === undefined) delete process.env.CHAINS;
    else process.env.CHAINS = previousChains;
  });

  it('adds up what the wallets hold, in dollars, with the gas of each chain', async () => {
    const wallet = createEvmWallet();
    const address = wallet.address.toLowerCase();
    createdAddresses.push(address);
    const session = await signIn(app, wallet);

    holdings.set(`native:${address}`, parseEther('0.5'));
    holdings.set(`${usdc}:${address}`, usd('250'));
    holdings.set(`${launchToken}:${address}`, parseEther('2000'));

    // A listed launch, paired with USDC, that this wallet bought
    const native = await prisma.asset.findUniqueOrThrow({
      where: { chainKey_address: { chainKey, address: 'native' } },
    });
    const usdcAsset = await prisma.asset.findUniqueOrThrow({
      where: { chainKey_address: { chainKey, address: usdc } },
    });
    const createdAt = new Date();
    const id = launchRowId({ chainKey, launchpad, launchId: 0, createdAt });
    await prisma.launch.create({
      data: {
        id,
        chainKey,
        launchpad,
        launchId: 0,
        launchpadVersion: 3,
        quoteAssetId: usdcAsset.id,
        tokenDecimals: 18,
        tokenAddress: launchToken,
        saleAddress: randomAddress().toLowerCase(),
        vestingAddress: randomAddress().toLowerCase(),
        creatorAddress: randomAddress().toLowerCase(),
        name: 'Orbit Token',
        symbol: 'ORBIT',
        totalSupply: parseEther('1000000').toString(),
        tokensForSale: parseEther('582352').toString(),
        creatorAllocation: parseEther('10000').toString(),
        softCap: usd('100').toString(),
        hardCap: usd('10000').toString(),
        minContribution: '0',
        maxContribution: '0',
        startTime: createdAt,
        endTime: createdAt,
        creatorAllocationBps: 100,
        liquidityBps: 7000,
        feeBps: 50,
        vestingTranches: 3,
        finalizedAt: createdAt,
        pairAddress: pair,
        createdAt,
        createdBlock: 1n,
        createdTxHash: `0x${'1'.repeat(64)}`,
        contributions: {
          create: {
            contributor: address,
            amount: usd('100').toString(),
            firstContributedAt: createdAt,
          },
        },
      },
    });
    expect(native.symbol).toBe('ETH');

    const response = await apiClient(app, session).get('/balances').expect(200);
    const body = response.body;

    // 0.5 ETH at $2,000, 250 USDC at $1, 2,000 ORBIT at 0.05 USDC
    expect(body.totalUsd).toBeCloseTo(1000 + 250 + 100, 6);
    expect(
      body.items.map((item: { asset: { symbol: string }; usd: number }) => [
        item.asset.symbol,
        item.usd,
      ]),
    ).toEqual([
      ['ETH', 1000],
      ['USDC', 250],
      ['ORBIT', expect.closeTo(100, 6)],
    ]);
    expect(body.items[2]).toMatchObject({
      launchId: id,
      amount: parseEther('2000').toString(),
    });
    // 0.5 ETH at 2 gwei pays for 1,000 actions of 250,000 gas
    expect(body.gas).toEqual([
      {
        chainKey,
        chainName: 'Test chain',
        wallet: address,
        nativeAmount: parseEther('0.5').toString(),
        level: 'ok',
        actionsLeft: 1000,
        suggestedAmount: parseEther('0.005').toString(),
        suggestedUsd: 10,
      },
    ]);
    // The chain that does not answer is named, not hidden in an error
    expect(body.unavailable).toEqual([deadChainKey]);
  });

  it('says when a wallet is low on gas, or has none', async () => {
    const wallet = createEvmWallet();
    const address = wallet.address.toLowerCase();
    createdAddresses.push(address);
    const session = await signIn(app, wallet);
    gasPrice = parseUnits('1', 9);

    holdings.set(`native:${address}`, parseEther('0.0005')); // 2 actions
    const low = await apiClient(app, session).get('/balances').expect(200);
    expect(low.body.gas[0]).toMatchObject({ level: 'low', actionsLeft: 2 });
  });

  it('shows balances only to the account itself', async () => {
    await apiClient(app).get('/balances').expect(401);
  });
});
