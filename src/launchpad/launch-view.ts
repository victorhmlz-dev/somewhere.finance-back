import { type AssetView, toAssetView } from '../assets/asset-view.js';
import type {
  ChainConfig,
  ChainFamily,
  NativeCurrency,
} from '../config/chains.js';
import type {
  Asset,
  Launch,
  LaunchContribution,
  LaunchProfile,
} from '../generated/prisma/client.js';
import type { ReactionCount } from '../reactions/reactions.service.js';
import type { UserSummary } from '../users/user-profile.js';
import {
  finalizeDeadline,
  launchStatus,
  type LaunchStatus,
} from './launch-status.js';

/** A chain as the front needs it to show launches and to send transactions. */
export interface ChainView {
  key: string;
  family: ChainFamily;
  /** For EVM chains. Null on other families. */
  chainId: number | null;
  name: string;
  /** What the chain pays its fees in. */
  nativeCurrency: NativeCurrency;
  /** Address of the Launchpad contract, where launches are created. */
  launchpad: string | null;
}

export function toChainView(chain: ChainConfig): ChainView {
  return {
    key: chain.key,
    family: chain.family,
    chainId: chain.family === 'evm' ? chain.chainId : null,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    launchpad: chain.family === 'evm' ? chain.launchpad : null,
  };
}

/** A launch row with the asset it is sold for. */
export type LaunchRow = Launch & { quoteAsset: Asset };

/** What has to be loaded with a launch to build its view. */
export const LAUNCH_INCLUDE = { quoteAsset: true } as const;

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
 * A token launch. Every amount is an integer in text, in the smallest unit of
 * its asset: `quoteAsset.decimals` for what is paid (caps, contributions,
 * raise), `tokenDecimals` for the token. Nothing here assumes a currency.
 */
export interface LaunchView {
  id: string;
  type: 'token';
  chain: ChainView;
  name: string;
  symbol: string;
  description: string;
  image: string | null;
  /**
   * When the creator set the description and image. Null while they can
   * still be set: once, before the sale starts.
   */
  detailsSetAt: string | null;
  status: LaunchStatus;
  creator: { address: string; user: UserSummary | null };

  /** What the token is sold for and paired with. */
  quoteAsset: AssetView;
  tokenDecimals: number;
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
    liquidityQuote: string;
    liquidityTokens: string;
    creatorQuote: string;
    fee: string;
    tokensBurned: string;
  } | null;

  /** The viewer's own contribution. Null without a session or without one. */
  myContribution: ContributionView | null;

  /** Every emoji reaction to the launch, with zero when nobody used it. */
  reactions: ReactionCount[];
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
  launch: LaunchRow,
  chain: ChainConfig,
  creatorUser: UserSummary | null,
  myContributions: LaunchContribution[],
  profile: LaunchProfile | null,
  reactions: ReactionCount[],
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
    description: profile?.description ?? '',
    image: profile?.imageUrl ?? null,
    detailsSetAt: profile?.detailsSetAt.toISOString() ?? null,
    status: launchStatus(timeline, now),
    creator: { address: launch.creatorAddress, user: creatorUser },
    quoteAsset: toAssetView(launch.quoteAsset),
    tokenDecimals: launch.tokenDecimals,
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
            liquidityQuote: launch.liquidityQuote?.toFixed() ?? '0',
            liquidityTokens: launch.liquidityTokens?.toFixed() ?? '0',
            creatorQuote: launch.creatorQuote?.toFixed() ?? '0',
            fee: launch.fee?.toFixed() ?? '0',
            tokensBurned: launch.tokensBurned?.toFixed() ?? '0',
          }
        : null,
    myContribution: toContributionView(myContributions),
    reactions,
  };
}
