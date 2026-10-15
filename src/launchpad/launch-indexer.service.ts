import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseError, type Hex } from 'viem';
import type { Env } from '../config/env.js';
import { AssetsService } from '../assets/assets.service.js';
import {
  hasLaunchpad,
  type LaunchpadChainConfig,
  type LaunchpadConfig,
} from '../config/chains.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CHAIN_READER_FACTORY,
  type ChainLog,
  type ChainReader,
  type ChainReaderFactory,
} from './chain-reader.js';
import { applyPendingDetails } from './launch-details.js';
import {
  applyLog,
  newLaunchAddresses,
  quoteAssetOf,
  type LogSource,
} from './launch-events.js';

/** How long the details of a launch wait for the launch to be indexed. */
const PENDING_DETAILS_TTL_MS = 24 * 60 * 60 * 1000;

/** Contract addresses per request to the node. */
const ADDRESSES_PER_REQUEST = 500;

const byPosition = (a: ChainLog, b: ChainLog) =>
  a.blockNumber === b.blockNumber
    ? a.logIndex - b.logIndex
    : a.blockNumber < b.blockNumber
      ? -1
      : 1;

/**
 * What went wrong, without the node URL: it usually carries the API key of
 * the provider, and logs are read by more people than the .env file.
 */
function describeError(error: unknown, chain: LaunchpadChainConfig): string {
  const message =
    error instanceof BaseError
      ? [error.shortMessage, error.details].filter(Boolean).join(' ')
      : error instanceof Error
        ? error.message
        : String(error);
  return message.replaceAll(chain.rpcUrl, '<node URL>');
}

/**
 * Copies what happens in the launchpad contracts into the database: it reads
 * their events block by block and applies them in order. Each Launchpad of a
 * chain (a v2 and a v3, say) is read on its own, from its own start block,
 * with its own position. Each batch of blocks is saved in one transaction
 * together with the position reached, so a crash never leaves a block half
 * applied nor applies it twice.
 *
 * It only reads blocks that are `confirmations` deep, because what it has
 * read it never unreads. If the chain still replaces a block it had read, it
 * stops and reports it rather than keep building on data that is no longer
 * true.
 */
@Injectable()
export class LaunchIndexerService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(LaunchIndexerService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** The wrapped native currency of each v3 Launchpad, read once. */
  private readonly wrappedNative = new Map<string, string>();
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly assets: AssetsService,
    @Inject(CHAIN_READER_FACTORY)
    private readonly createReader: ChainReaderFactory,
  ) {}

  onApplicationBootstrap() {
    // Only EVM chains with a Launchpad have launches to read for now
    const chains = this.config
      .get('CHAINS', { infer: true })
      .filter(hasLaunchpad);
    for (const chain of chains) {
      const list = chain.launchpads
        .map((launchpad) => `${launchpad.address} (v${launchpad.version})`)
        .join(', ');
      this.logger.log(`Indexing ${chain.key}: ${list}`);
      this.poll(chain, this.createReader(chain));
    }
  }

  onModuleDestroy() {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
  }

  /**
   * Reads everything new on one chain, Launchpad by Launchpad. Returns how
   * many blocks it read, adding up every Launchpad.
   */
  async sync(
    chain: LaunchpadChainConfig,
    reader: ChainReader,
  ): Promise<number> {
    let blocks = 0;
    for (const launchpad of chain.launchpads) {
      if (this.stopped) break;
      blocks += await this.syncLaunchpad(chain, launchpad, reader);
    }
    await this.settlePendingDetails(chain);
    return blocks;
  }

  private async syncLaunchpad(
    chain: LaunchpadChainConfig,
    launchpad: LaunchpadConfig,
    reader: ChainReader,
  ): Promise<number> {
    // A Launchpad added to the configuration has no position yet and is read
    // from its own start block. One taken out keeps its launches in the
    // database, out of sight, with everything people added to them.
    const cursor = await this.prisma.chainCursor.findUnique({
      where: {
        chainKey_launchpad: {
          chainKey: chain.key,
          launchpad: launchpad.address,
        },
      },
    });
    if (cursor) {
      const block = await reader.getBlock(cursor.lastBlock).catch(() => null);
      if (!block) {
        // Typical of a local chain that was restarted.
        throw new Error(
          `${chain.key}: block ${cursor.lastBlock}, the last one indexed, no ` +
            `longer exists. Run "npm run launchpad:reset -- ${chain.key}".`,
        );
      }
      if (block.hash !== cursor.lastHash) {
        throw new Error(
          `${chain.key}: block ${cursor.lastBlock} was replaced after being ` +
            `indexed. Raise "confirmations" for this chain and reindex it.`,
        );
      }
    }

    const target =
      (await reader.getBlockNumber()) - BigInt(chain.confirmations);
    let from = cursor ? cursor.lastBlock + 1n : BigInt(launchpad.startBlock);
    const first = from;

    while (from <= target && !this.stopped) {
      const candidate = from + BigInt(chain.logBlockRange) - 1n;
      const to = candidate < target ? candidate : target;
      await this.indexRange(chain, launchpad, reader, from, to);
      from = to + 1n;
    }
    return Number(from - first);
  }

  /**
   * Applies details that arrived while their launch was being indexed, which
   * the indexer could not see then, and forgets the ones that waited too long.
   */
  private async settlePendingDetails(
    chain: LaunchpadChainConfig,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.pendingLaunchDetails.deleteMany({
      where: {
        chainKey: chain.key,
        createdAt: { lt: new Date(now.getTime() - PENDING_DETAILS_TTL_MS) },
      },
    });
    const pending = await this.prisma.pendingLaunchDetails.findMany({
      where: { chainKey: chain.key },
      select: { txHash: true },
    });
    if (pending.length === 0) return;
    const launches = await this.prisma.launch.findMany({
      where: {
        chainKey: chain.key,
        launchpad: { in: chain.launchpads.map((item) => item.address) },
        createdTxHash: { in: pending.map((row) => row.txHash) },
      },
    });
    for (const launch of launches) {
      await this.prisma.$transaction((tx) =>
        applyPendingDetails(tx, launch, now),
      );
    }
  }

  private async indexRange(
    chain: LaunchpadChainConfig,
    launchpad: LaunchpadConfig,
    reader: ChainReader,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<void> {
    const range = { fromBlock, toBlock };
    const { address: launchpadAddress, version } = launchpad;

    const launchpadLogs = await reader.getLogs({
      addresses: [launchpadAddress],
      ...range,
    });

    // Sales and vestings to listen to: the known ones, plus the ones created
    // in these very blocks, which can already have events of their own.
    const sources = new Map<string, LogSource>([
      [launchpadAddress, 'launchpad'],
    ]);
    const known = await this.prisma.launch.findMany({
      where: { chainKey: chain.key, launchpad: launchpadAddress },
      select: { saleAddress: true, vestingAddress: true },
    });
    for (const launch of known) {
      sources.set(launch.saleAddress, 'sale');
      sources.set(launch.vestingAddress, 'vesting');
    }
    for (const log of launchpadLogs) {
      const created = newLaunchAddresses(log, version);
      if (!created) continue;
      sources.set(created.sale, 'sale');
      sources.set(created.vesting, 'vesting');
    }

    const launchAddresses = [...sources.keys()].filter(
      (address) => address !== launchpadAddress,
    ) as Hex[];
    const launchLogs: ChainLog[] = [];
    for (let i = 0; i < launchAddresses.length; i += ADDRESSES_PER_REQUEST) {
      const addresses = launchAddresses.slice(i, i + ADDRESSES_PER_REQUEST);
      launchLogs.push(...(await reader.getLogs({ addresses, ...range })));
    }

    const logs = [...launchpadLogs, ...launchLogs].sort(byPosition);
    const blocks = new Map<bigint, { hash: string; time: Date }>();
    for (const number of new Set([
      ...logs.map((l) => l.blockNumber),
      toBlock,
    ])) {
      const block = await reader.getBlock(number);
      blocks.set(number, {
        hash: block.hash,
        time: new Date(Number(block.timestamp) * 1000),
      });
    }

    const nativeAsset = await this.assets.nativeOf(chain.key);
    const assetIds = await this.registerQuoteAssets(
      chain,
      launchpad,
      reader,
      launchpadLogs,
      nativeAsset.id,
    );
    await this.prisma.$transaction(
      async (tx) => {
        for (const log of logs) {
          const source = sources.get(log.address.toLowerCase());
          if (!source) continue;
          const block = blocks.get(log.blockNumber)!;
          await applyLog(
            tx,
            {
              chainKey: chain.key,
              launchpad: launchpadAddress,
              version,
              nativeAssetId: nativeAsset.id,
              assetIds,
              source,
              blockHash: block.hash,
              blockTime: block.time,
            },
            log,
          );
        }

        const key = { chainKey: chain.key, launchpad: launchpadAddress };
        const position = {
          lastBlock: toBlock,
          lastHash: blocks.get(toBlock)!.hash,
        };
        await tx.chainCursor.upsert({
          where: { chainKey_launchpad: key },
          create: { ...key, ...position },
          update: position,
        });
      },
      { timeout: 60_000 },
    );
  }

  /**
   * Registers the tokens the logs of a v3 Launchpad pair launches with,
   * before the logs are applied: reading a token is a call to the node,
   * which does not belong inside the database transaction. Returns the asset
   * of each, by address; the wrapped native currency is the native asset.
   */
  private async registerQuoteAssets(
    chain: LaunchpadChainConfig,
    launchpad: LaunchpadConfig,
    reader: ChainReader,
    logs: ChainLog[],
    nativeAssetId: string,
  ): Promise<Map<string, string>> {
    const assetIds = new Map<string, string>();
    const tokens = new Set(
      logs
        .map((log) => quoteAssetOf(log, launchpad.version))
        .filter((token): token is string => token !== null),
    );
    if (tokens.size === 0) return assetIds;

    const cacheKey = `${chain.key}:${launchpad.address}`;
    let wrapped = this.wrappedNative.get(cacheKey);
    if (!wrapped) {
      wrapped = (
        await reader.getWrappedNative(launchpad.address)
      ).toLowerCase();
      this.wrappedNative.set(cacheKey, wrapped);
    }

    for (const token of tokens) {
      if (token === wrapped) {
        assetIds.set(token, nativeAssetId);
        continue;
      }
      const asset = await this.assets.ensureToken(chain, token, () =>
        reader.getTokenMetadata(token as Hex),
      );
      assetIds.set(token, asset.id);
    }
    return assetIds;
  }

  /** Syncs now and again after every pause, for as long as the app runs. */
  private poll(chain: LaunchpadChainConfig, reader: ChainReader) {
    const pollMs = this.config.get('INDEXER_POLL_MS', { infer: true });
    const run = async () => {
      try {
        await this.sync(chain, reader);
      } catch (error) {
        this.logger.error(
          `Could not index ${chain.key}: ${describeError(error, chain)}`,
        );
      }
      if (!this.stopped) this.timers.set(chain.key, setTimeout(run, pollMs));
    };
    void run();
  }
}
