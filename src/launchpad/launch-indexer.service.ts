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
import type { EvmChainConfig } from '../config/evm-chains.js';
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
function describeError(error: unknown, chain: EvmChainConfig): string {
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
 * their events block by block and applies them in order. Each batch of blocks
 * is saved in one transaction together with the position reached, so a crash
 * never leaves a block half applied nor applies it twice.
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
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CHAIN_READER_FACTORY)
    private readonly createReader: ChainReaderFactory,
  ) {}

  onApplicationBootstrap() {
    const chains = this.config.get('EVM_CHAINS', { infer: true });
    for (const chain of chains) {
      this.logger.log(`Indexing the launchpad of ${chain.key}`);
      this.poll(chain, this.createReader(chain));
    }
  }

  onModuleDestroy() {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
  }

  /** Reads everything new on one chain. Returns how many blocks it read. */
  async sync(chain: EvmChainConfig, reader: ChainReader): Promise<number> {
    const cursor = await this.prisma.chainCursor.findUnique({
      where: { chainKey: chain.key },
    });
    if (cursor?.launchpad && cursor.launchpad !== chain.launchpad) {
      throw new Error(
        `${chain.key}: the configured Launchpad (${chain.launchpad}) is not ` +
          `the one indexed so far (${cursor.launchpad}). To index the new ` +
          `one, stop the API and run "npm run launchpad:reset -- ${chain.key}".`,
      );
    }
    if (cursor) {
      const block = await reader
        .getBlock(BigInt(cursor.lastBlock))
        .catch(() => null);
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
    let from = BigInt(cursor ? cursor.lastBlock + 1 : chain.startBlock);
    const first = from;

    while (from <= target && !this.stopped) {
      const candidate = from + BigInt(chain.logBlockRange) - 1n;
      const to = candidate < target ? candidate : target;
      await this.indexRange(chain, reader, from, to);
      from = to + 1n;
    }
    await this.settlePendingDetails(chain);
    return Number(from - first);
  }

  /**
   * Applies details that arrived while their launch was being indexed, which
   * the indexer could not see then, and forgets the ones that waited too long.
   */
  private async settlePendingDetails(chain: EvmChainConfig): Promise<void> {
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
    chain: EvmChainConfig,
    reader: ChainReader,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<void> {
    const range = { fromBlock, toBlock };

    const launchpadLogs = await reader.getLogs({
      addresses: [chain.launchpad],
      ...range,
    });

    // Sales and vestings to listen to: the known ones, plus the ones created
    // in these very blocks, which can already have events of their own.
    const sources = new Map<string, LogSource>([
      [chain.launchpad, 'launchpad'],
    ]);
    const known = await this.prisma.launch.findMany({
      where: { chainKey: chain.key },
      select: { saleAddress: true, vestingAddress: true },
    });
    for (const launch of known) {
      sources.set(launch.saleAddress, 'sale');
      sources.set(launch.vestingAddress, 'vesting');
    }
    for (const log of launchpadLogs) {
      const created = newLaunchAddresses(log);
      if (!created) continue;
      sources.set(created.sale, 'sale');
      sources.set(created.vesting, 'vesting');
    }

    const launchAddresses = [...sources.keys()].filter(
      (address) => address !== chain.launchpad,
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
              source,
              blockHash: block.hash,
              blockTime: block.time,
            },
            log,
          );
        }

        const position = {
          launchpad: chain.launchpad,
          lastBlock: Number(toBlock),
          lastHash: blocks.get(toBlock)!.hash,
        };
        await tx.chainCursor.upsert({
          where: { chainKey: chain.key },
          create: { chainKey: chain.key, ...position },
          update: position,
        });
      },
      { timeout: 60_000 },
    );
  }

  /** Syncs now and again after every pause, for as long as the app runs. */
  private poll(chain: EvmChainConfig, reader: ChainReader) {
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
