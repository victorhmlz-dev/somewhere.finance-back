import type { EvmChainConfig } from '../config/evm-chains.js';
import type { Launch, LaunchContribution } from '../generated/prisma/client.js';
import type { UserSummary } from '../users/user-profile.js';
import {
  finalizeDeadline,
  launchStatus,
  type LaunchStatus,
} from './launch-status.js';

/** A chain as the front needs it to show launches and to send transactions. */
export interface ChainView {
  key: string;
  chainId: number;
  name: string;
  nativeSymbol: string;
  /** Address of the Launchpad contract, where launches are created. */
  launchpad: string;
}

export function toChainView(chain: EvmChainConfig): ChainView {
  return {
    key: chain.key,
    chainId: chain.chainId,
    name: chain.name,
    nativeSymbol: chain.nativeSymbol,
    launchpad: chain.launchpad,
  };
}

/** What the viewer put into a launch and what they got back. */
export interface ContributionView {
  /** In wei. */
  amount: string;
  /** Tokens already claimed, in the smallest unit. Null if not claimed. */
  claimedTokens: string | null;
  /** Wei already refunded. Null if not refunded. */
  refundedAmount: string | null;
}

/**
 * A token launch. Every amount is a string in the smallest unit (wei for the
 * native currency, 18 decimals for the token): they do not fit in a number.
 */
export interface LaunchView {
  id: string;
  type: 'token';
  chain: ChainView;
  name: string;
  symbol: string;
  description: string;
  image: string | null;
  status: LaunchStatus;
  creator: { address: string; user: UserSummary | null };

  tokenAddress: string;
  /** The contract to contribute to, claim from and ask for refunds. */
  saleAddress: string;
  vestingAddress: string;

  totalSupply: string;
  tokensForSale: string;
  softCap: string;
  hardCap: string;
  totalRaised: string;
  /** Zero when the sale sets no limit. */
  minContribution: string;
  maxContribution: string;
  contributorCount: number;

  startsAt: string;
  endsAt: string;
  /** Set while a successful sale waits to be finalized: until when it can be. */
  finalizeBy: string | null;
  /** Set when the creator cancelled the sale before it started. */
  cancelledAt: string | null;

  /** The rules of this launch, as percentages. */
  creatorAllocationPercent: number;
  liquidityPercent: number;
  feePercent: number;
  /** Monthly tranches in which the creator is paid. */
  vestingMonths: number;

  /** Set once the token is listed on the exchange. */
  listing: {
    listedAt: string;
    pairAddress: string;
    liquidityNative: string;
    liquidityTokens: string;
    creatorNative: string;
    fee: string;
    tokensBurned: string;
  } | null;

  /** The viewer's own contribution. Null without a session or without one. */
  myContribution: ContributionView | null;
}

const bpsToPercent = (bps: number) => bps / 100;

export function toContributionView(
  contributions: LaunchContribution[],
): ContributionView | null {
  if (contributions.length === 0) return null;
  // A user can hold several wallets; the view adds them up.
  const sum = (pick: (c: LaunchContribution) => { toFixed(): string } | null) =>
    contributions.reduce(
      (total, c) => total + BigInt(pick(c)?.toFixed() ?? 0),
      0n,
    );
  const claimed = contributions.some((c) => c.claimedTokens !== null);
  const refunded = contributions.some((c) => c.refundedAmount !== null);

  return {
    amount: sum((c) => c.amount).toString(),
    claimedTokens: claimed ? sum((c) => c.claimedTokens).toString() : null,
    refundedAmount: refunded ? sum((c) => c.refundedAmount).toString() : null,
  };
}

export function toLaunchView(
  launch: Launch,
  chain: EvmChainConfig,
  creatorUser: UserSummary | null,
  myContributions: LaunchContribution[],
  now: Date,
): LaunchView {
  const timeline = {
    startTime: launch.startTime,
    endTime: launch.endTime,
    reachedSoftCap: launch.totalRaised.greaterThanOrEqualTo(launch.softCap),
    hardCapReachedAt: launch.hardCapReachedAt,
    finalizedAt: launch.finalizedAt,
    cancelledAt: launch.cancelledAt,
  };

  return {
    id: launch.id,
    type: 'token',
    chain: toChainView(chain),
    name: launch.name,
    symbol: launch.symbol,
    description: launch.description,
    image: launch.imageUrl,
    status: launchStatus(timeline, now),
    creator: { address: launch.creatorAddress, user: creatorUser },
    tokenAddress: launch.tokenAddress,
    saleAddress: launch.saleAddress,
    vestingAddress: launch.vestingAddress,
    totalSupply: launch.totalSupply.toFixed(),
    tokensForSale: launch.tokensForSale.toFixed(),
    softCap: launch.softCap.toFixed(),
    hardCap: launch.hardCap.toFixed(),
    totalRaised: launch.totalRaised.toFixed(),
    minContribution: launch.minContribution.toFixed(),
    maxContribution: launch.maxContribution.toFixed(),
    contributorCount: launch.contributorCount,
    startsAt: launch.startTime.toISOString(),
    endsAt: launch.endTime.toISOString(),
    finalizeBy: finalizeDeadline(timeline, now)?.toISOString() ?? null,
    cancelledAt: launch.cancelledAt?.toISOString() ?? null,
    creatorAllocationPercent: bpsToPercent(launch.creatorAllocationBps),
    liquidityPercent: bpsToPercent(launch.liquidityBps),
    feePercent: bpsToPercent(launch.feeBps),
    vestingMonths: launch.vestingTranches,
    listing:
      launch.finalizedAt && launch.pairAddress
        ? {
            listedAt: launch.finalizedAt.toISOString(),
            pairAddress: launch.pairAddress,
            liquidityNative: launch.liquidityNative?.toFixed() ?? '0',
            liquidityTokens: launch.liquidityTokens?.toFixed() ?? '0',
            creatorNative: launch.creatorNative?.toFixed() ?? '0',
            fee: launch.fee?.toFixed() ?? '0',
            tokensBurned: launch.tokensBurned?.toFixed() ?? '0',
          }
        : null,
    myContribution: toContributionView(myContributions),
  };
}
