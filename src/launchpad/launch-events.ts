import { decodeEventLog, type Abi } from 'viem';
import type { Launch, Prisma } from '../generated/prisma/client.js';
import { addNotification } from '../notifications/notification-events.js';
import {
  creatorVestingEvents,
  launchpadEvents,
  tokenSaleEvents,
} from './abi.js';
import type { ChainLog } from './chain-reader.js';
import { applyPendingDetails } from './launch-details.js';
import { launchRowId } from './launch-id.js';

type Tx = Prisma.TransactionClient;

/** Which contract of a launch emitted a log. */
export type LogSource = 'launchpad' | 'sale' | 'vesting';

const ABI_BY_SOURCE: Record<LogSource, Abi> = {
  launchpad: launchpadEvents,
  sale: tokenSaleEvents,
  vesting: creatorVestingEvents,
};

export interface LogContext {
  chainKey: string;
  /** The Launchpad contract being read, in lowercase. */
  launchpad: string;
  /** The asset launches of this contract are sold for. */
  quoteAssetId: string;
  source: LogSource;
  blockHash: string;
  blockTime: Date;
}

const lower = (address: string) => address.toLowerCase();
const toDate = (seconds: bigint) => new Date(Number(seconds) * 1000);

/** Event arguments as plain JSON: big numbers become strings. */
function toJson(value: unknown): Prisma.InputJsonValue {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJson(item)]),
    );
  }
  return value as Prisma.InputJsonValue;
}

/**
 * The addresses a `LaunchCreated` log announces, or null for any other log.
 * The indexer needs them before it can ask for the events of the new sale.
 */
export function newLaunchAddresses(
  log: ChainLog,
): { sale: string; vesting: string } | null {
  const decoded = decode('launchpad', log);
  if (decoded?.eventName !== 'LaunchCreated') return null;
  const args = decoded.args as { sale: string; vesting: string };
  return { sale: lower(args.sale), vesting: lower(args.vesting) };
}

function decode(source: LogSource, log: ChainLog) {
  try {
    return decodeEventLog({
      abi: ABI_BY_SOURCE[source],
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      data: log.data,
    }) as unknown as { eventName: string; args: Record<string, unknown> };
  } catch {
    // Not one of the events of that contract: nothing to record.
    return null;
  }
}

/**
 * Records one log and applies it to the launch tables. A log already recorded
 * is skipped, so reading the same block twice changes nothing.
 */
export async function applyLog(
  tx: Tx,
  context: LogContext,
  log: ChainLog,
): Promise<void> {
  const decoded = decode(context.source, log);
  if (!decoded) return;
  const { eventName, args } = decoded;
  const address = lower(log.address);

  const { count } = await tx.chainEvent.createMany({
    data: [
      {
        chainKey: context.chainKey,
        blockNumber: log.blockNumber,
        blockHash: context.blockHash,
        blockTime: context.blockTime,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        address,
        name: eventName,
        args: toJson(args),
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) return;

  if (context.source === 'launchpad') {
    if (eventName === 'LaunchCreated') {
      await createLaunch(tx, context, log, args as unknown as LaunchCreated);
    }
    return;
  }

  const where = { chainKey: context.chainKey, launchpad: context.launchpad };
  const launch = await tx.launch.findFirst({
    where:
      context.source === 'sale'
        ? { ...where, saleAddress: address }
        : { ...where, vestingAddress: address },
  });
  // The indexer only asks for logs of contracts it knows.
  if (!launch) return;

  const handler = HANDLERS[eventName];
  if (handler) {
    await handler(tx, launch, args, {
      blockTime: context.blockTime,
      sourceKey: `${context.chainKey}:${log.transactionHash.toLowerCase()}:${log.logIndex}`,
    });
  }
}

interface LaunchCreated {
  launchId: bigint;
  creator: string;
  token: string;
  sale: string;
  vesting: string;
  params: {
    name: string;
    symbol: string;
    totalSupply: bigint;
    softCap: bigint;
    hardCap: bigint;
    minContribution: bigint;
    maxContribution: bigint;
    startTime: bigint;
    endTime: bigint;
    creatorAllocationBps: number;
    liquidityBps: number;
    vestingTranches: number;
  };
  tokensForSale: bigint;
  creatorAllocation: bigint;
  feeBps: number;
}

async function createLaunch(
  tx: Tx,
  context: LogContext,
  log: ChainLog,
  event: LaunchCreated,
): Promise<void> {
  const { params } = event;
  const origin = {
    chainKey: context.chainKey,
    launchpad: context.launchpad,
    launchId: Number(event.launchId),
    createdAt: context.blockTime,
  };
  const launch = await tx.launch.create({
    data: {
      // The same id every time the chain is read: what people added about
      // the launch points to it
      id: launchRowId(origin),
      chainKey: origin.chainKey,
      launchpad: origin.launchpad,
      launchId: origin.launchId,
      quoteAssetId: context.quoteAssetId,
      // LaunchToken has 18 decimals
      tokenDecimals: 18,
      tokenAddress: lower(event.token),
      saleAddress: lower(event.sale),
      vestingAddress: lower(event.vesting),
      creatorAddress: lower(event.creator),
      // The contract accepts any text; the columns have a size.
      name: params.name.slice(0, 100),
      symbol: params.symbol.slice(0, 32),
      totalSupply: params.totalSupply.toString(),
      tokensForSale: event.tokensForSale.toString(),
      creatorAllocation: event.creatorAllocation.toString(),
      softCap: params.softCap.toString(),
      hardCap: params.hardCap.toString(),
      minContribution: params.minContribution.toString(),
      maxContribution: params.maxContribution.toString(),
      startTime: toDate(params.startTime),
      endTime: toDate(params.endTime),
      creatorAllocationBps: params.creatorAllocationBps,
      liquidityBps: params.liquidityBps,
      feeBps: event.feeBps,
      vestingTranches: params.vestingTranches,
      createdAt: context.blockTime,
      createdBlock: log.blockNumber,
      createdTxHash: log.transactionHash.toLowerCase(),
    },
  });
  // The creator may have sent its description and image already
  await applyPendingDetails(tx, launch, new Date());
}

/** The user who holds an EVM wallet, if any does. */
async function userOfWallet(tx: Tx, address: string): Promise<string | null> {
  const wallet = await tx.wallet.findFirst({
    where: { family: 'evm', address },
    select: { userId: true },
  });
  return wallet?.userId ?? null;
}

/** Where an event happened: its block time and a key unique to the event. */
interface EventContext {
  blockTime: Date;
  /** "<chain>:<transaction>:<log index>". */
  sourceKey: string;
}

type Handler = (
  tx: Tx,
  launch: Launch,
  args: Record<string, unknown>,
  event: EventContext,
) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  async Contributed(tx, launch, args, { blockTime, sourceKey }) {
    const contributor = lower(args.contributor as string);
    const amount = (args.amount as bigint).toString();
    const totalRaised = (args.totalRaised as bigint).toString();

    const key = { launchRowId: launch.id, contributor };
    const existing = await tx.launchContribution.findUnique({
      where: { launchRowId_contributor: key },
    });
    if (existing) {
      await tx.launchContribution.update({
        where: { id: existing.id },
        data: { amount: { increment: amount } },
      });
    } else {
      await tx.launchContribution.create({
        data: { ...key, amount, firstContributedAt: blockTime },
      });
    }

    await tx.launch.update({
      where: { id: launch.id },
      data: {
        totalRaised,
        contributorCount: existing ? undefined : { increment: 1 },
        hardCapReachedAt: launch.hardCap.equals(totalRaised)
          ? blockTime
          : undefined,
      },
    });

    // The same rounding as TokenSale.tokensFor
    const tokens =
      ((args.amount as bigint) * BigInt(launch.tokensForSale.toFixed())) /
      BigInt(launch.hardCap.toFixed());
    const purchase = {
      launchId: launch.id,
      quoteAmount: amount,
      tokenAmount: tokens.toString(),
      createdAt: blockTime,
      // Reading the chain again does not repeat the notification
      sourceKey,
    };
    const buyerId = await userOfWallet(tx, contributor);
    const creatorId = await userOfWallet(tx, launch.creatorAddress);
    if (creatorId) {
      await addNotification(tx, {
        ...purchase,
        type: 'launch_purchase',
        recipientId: creatorId,
        actorId: buyerId,
        actorAddress: buyerId ? undefined : contributor,
      });
    }
    if (buyerId) {
      await addNotification(tx, {
        ...purchase,
        type: 'purchase',
        recipientId: buyerId,
        actorId: null,
      });
    }
  },

  async Finalized(tx, launch, args, { blockTime }) {
    await tx.launch.update({
      where: { id: launch.id },
      data: {
        finalizedAt: blockTime,
        pairAddress: lower(args.pair as string),
        // The v2 contract names the quote asset "native"
        liquidityQuote: (args.liquidityNative as bigint).toString(),
        liquidityTokens: (args.liquidityTokens as bigint).toString(),
        creatorQuote: (args.creatorNative as bigint).toString(),
        fee: (args.fee as bigint).toString(),
        tokensBurned: (args.tokensBurned as bigint).toString(),
      },
    });
  },

  async Cancelled(tx, launch, args, { blockTime }) {
    await tx.launch.update({
      where: { id: launch.id },
      data: {
        cancelledAt: blockTime,
        tokensBurned: (args.tokensBurned as bigint).toString(),
      },
    });
  },

  async Claimed(tx, launch, args, { blockTime }) {
    await tx.launchContribution.updateMany({
      where: {
        launchRowId: launch.id,
        contributor: lower(args.contributor as string),
      },
      data: {
        claimedTokens: (args.tokens as bigint).toString(),
        claimedAt: blockTime,
      },
    });
  },

  async Refunded(tx, launch, args, { blockTime }) {
    await tx.launchContribution.updateMany({
      where: {
        launchRowId: launch.id,
        contributor: lower(args.contributor as string),
      },
      data: {
        refundedAmount: (args.amount as bigint).toString(),
        refundedAt: blockTime,
      },
    });
  },

  async FeeCollected(tx, launch, _args, { blockTime }) {
    await tx.launch.update({
      where: { id: launch.id },
      data: { feeCollectedAt: blockTime },
    });
  },

  async Released(tx, launch, args) {
    await tx.launch.update({
      where: { id: launch.id },
      data: {
        vestingReleasedQuote: {
          increment: (args.nativeAmount as bigint).toString(),
        },
        vestingReleasedTokens: {
          increment: (args.tokenAmount as bigint).toString(),
        },
      },
    });
  },
};
