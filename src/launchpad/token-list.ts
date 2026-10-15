import { getAddress } from 'viem';
import type { Launch } from '../generated/prisma/client.js';

/**
 * The token list format wallets and exchanges import (tokenlists.org, by
 * Uniswap). Only the fields this API fills in.
 */
export interface TokenList {
  name: string;
  timestamp: string;
  version: { major: number; minor: number; patch: number };
  keywords: string[];
  tokens: {
    chainId: number;
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
  }[];
}

/** Every launch token has 18 decimals, as `LaunchToken` does. */
const DECIMALS = 18;

// What the format accepts for a token's name and symbol. A launch can be
// created with anything, so the few that do not fit are left out.
const NAME_PATTERN = /^[ \S]{1,60}$/u;
const SYMBOL_PATTERN = /^\S{1,20}$/u;

type ListedLaunch = Pick<
  Launch,
  'tokenAddress' | 'name' | 'symbol' | 'imageUrl'
> & { chainId: number };

/**
 * The tokens of the launches that were listed, oldest first. A token joins
 * the list when it is listed and never leaves it, and its image can only be
 * set once, so the version can be counted from the list itself: the minor
 * number counts tokens and the patch number counts images.
 */
export function toTokenList(launches: ListedLaunch[], now: Date): TokenList {
  const tokens = launches
    .filter(
      (launch) =>
        NAME_PATTERN.test(launch.name) && SYMBOL_PATTERN.test(launch.symbol),
    )
    .map((launch) => ({
      chainId: launch.chainId,
      address: getAddress(launch.tokenAddress),
      name: launch.name,
      symbol: launch.symbol,
      decimals: DECIMALS,
      ...(launch.imageUrl ? { logoURI: launch.imageUrl } : {}),
    }));

  return {
    name: 'Somewhere Launchpad',
    timestamp: now.toISOString(),
    version: {
      major: 1,
      minor: tokens.length,
      patch: tokens.filter((token) => token.logoURI).length,
    },
    keywords: ['somewhere', 'launchpad'],
    tokens,
  };
}
