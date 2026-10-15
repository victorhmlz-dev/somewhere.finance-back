/**
 * The networks Somewhere works with. Nothing in the API may assume one
 * network, one family of networks or one currency: every chain says what it
 * is, and every amount says which asset it is in (see src/assets).
 */

/** Families of networks: each one has its own addresses, signatures and nodes. */
export const CHAIN_FAMILIES = ['evm', 'solana'] as const;
export type ChainFamily = (typeof CHAIN_FAMILIES)[number];

/** The currency a chain pays its fees in. */
export interface NativeCurrency {
  symbol: string;
  name: string;
  decimals: number;
}

interface BaseChainConfig {
  /** Name the API and the front use for the chain, e.g. "ethereum". */
  key: string;
  family: ChainFamily;
  /** Shown to users, e.g. "Ethereum". */
  name: string;
  nativeCurrency: NativeCurrency;
  rpcUrl: string;
}

/** An EVM chain, with the Launchpad contract to read, if it has one. */
export interface EvmChainConfig extends BaseChainConfig {
  family: 'evm';
  chainId: number;
  /** Address of the Launchpad contract, in lowercase. Null if none. */
  launchpad: `0x${string}` | null;
  /** Block the Launchpad was deployed in; the indexer starts there. */
  startBlock: number;
  /**
   * Blocks to wait before reading one. A block that recent can still be
   * replaced by the chain, and what the indexer has read it never unreads.
   */
  confirmations: number;
  /**
   * Most blocks to ask the node for events at once. Providers limit it on
   * their cheaper plans: Alchemy's free plan allows 10.
   */
  logBlockRange: number;
}

/** A Solana cluster. Launches there are not read yet. */
export interface SolanaChainConfig extends BaseChainConfig {
  family: 'solana';
  /** "mainnet-beta", "devnet" or "testnet". */
  cluster: string;
}

export type ChainConfig = EvmChainConfig | SolanaChainConfig;

/** An EVM chain with a Launchpad: what the indexer reads. */
export type LaunchpadChainConfig = EvmChainConfig & {
  launchpad: `0x${string}`;
};

export function hasLaunchpad(
  chain: ChainConfig,
): chain is LaunchpadChainConfig {
  return chain.family === 'evm' && chain.launchpad !== null;
}

const KEY_PATTERN = /^[a-z0-9-]{1,32}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_CLUSTERS = ['mainnet-beta', 'devnet', 'testnet'];

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

type Entry = Record<string, unknown>;

function parseNativeCurrency(
  entry: Entry,
  family: ChainFamily,
  fail: (problem: string) => never,
): NativeCurrency {
  const defaults =
    family === 'solana'
      ? { symbol: 'SOL', name: 'Solana', decimals: 9 }
      : { symbol: 'ETH', name: 'Ether', decimals: 18 };
  const raw = entry.nativeCurrency;
  if (raw === undefined) return defaults;
  if (typeof raw !== 'object' || raw === null) {
    fail('nativeCurrency must be { symbol, name, decimals }');
  }
  const { symbol, name, decimals } = raw as Entry;
  if (typeof symbol !== 'string' || !symbol) {
    fail('nativeCurrency.symbol must be text');
  }
  if (!isCount(decimals) || (decimals as number) > 36) {
    fail('nativeCurrency.decimals must be a number from 0 to 36');
  }
  return {
    symbol: symbol as string,
    name: typeof name === 'string' && name ? name : (symbol as string),
    decimals: decimals as number,
  };
}

function parseChain(entry: Entry, index: number): ChainConfig {
  const fail = (problem: string): never => {
    throw new Error(`CHAINS[${index}]: ${problem}`);
  };
  if (typeof entry !== 'object' || entry === null) fail('must be an object');

  const { key, rpcUrl } = entry;
  const family = entry.family ?? 'evm';
  if (!CHAIN_FAMILIES.includes(family as ChainFamily)) {
    fail(`family must be one of: ${CHAIN_FAMILIES.join(', ')}`);
  }
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    fail('key must be lowercase letters, numbers or dashes');
  }
  if (typeof rpcUrl !== 'string' || !URL.canParse(rpcUrl)) {
    fail('rpcUrl must be a valid URL');
  }
  const base = {
    key: key as string,
    name: typeof entry.name === 'string' ? entry.name : (key as string),
    nativeCurrency: parseNativeCurrency(entry, family as ChainFamily, fail),
    rpcUrl: rpcUrl as string,
  };

  if (family === 'solana') {
    const cluster = entry.cluster ?? 'mainnet-beta';
    if (typeof cluster !== 'string' || !SOLANA_CLUSTERS.includes(cluster)) {
      fail(`cluster must be one of: ${SOLANA_CLUSTERS.join(', ')}`);
    }
    if (entry.launchpad !== undefined) {
      fail('launchpads on Solana are not read yet');
    }
    return { ...base, family: 'solana', cluster: cluster as string };
  }

  const { chainId, launchpad } = entry;
  if (!isCount(chainId) || chainId === 0) fail('chainId must be a number');
  if (
    launchpad !== undefined &&
    (typeof launchpad !== 'string' || !ADDRESS_PATTERN.test(launchpad))
  ) {
    fail('launchpad must be a contract address');
  }
  const startBlock = entry.startBlock ?? 0;
  if (!isCount(startBlock)) fail('startBlock must be a block number');
  const confirmations = entry.confirmations ?? 0;
  if (!isCount(confirmations)) fail('confirmations must be a number');
  const logBlockRange = entry.logBlockRange ?? 2000;
  if (!isCount(logBlockRange) || logBlockRange === 0) {
    fail('logBlockRange must be a number of blocks, at least 1');
  }

  return {
    ...base,
    family: 'evm',
    chainId: chainId as number,
    launchpad: launchpad
      ? ((launchpad as string).toLowerCase() as `0x${string}`)
      : null,
    startBlock: startBlock as number,
    confirmations: confirmations as number,
    logBlockRange: logBlockRange as number,
  };
}

/** The older format: EVM chains with only the symbol of their currency. */
function fromLegacyEvmEntry(entry: Entry): Entry {
  if (typeof entry !== 'object' || entry === null) return entry;
  const { nativeSymbol, ...rest } = entry;
  return {
    ...rest,
    family: 'evm',
    ...(nativeSymbol !== undefined
      ? { nativeCurrency: { symbol: nativeSymbol, decimals: 18 } }
      : {}),
  };
}

function parseList(raw: unknown, name: string): Entry[] {
  if (typeof raw !== 'string') throw new Error(`${name} must be a string`);
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (!Array.isArray(list)) throw new Error(`${name} must be a JSON list`);
  return list as Entry[];
}

/**
 * Reads CHAINS, a JSON list of chains of any family. EVM_CHAINS, the older
 * list of EVM chains with `nativeSymbol`, is still read when CHAINS is not
 * set. Empty or missing means no chain, which is how the API runs when only
 * its social part is needed.
 */
export function parseChains(
  raw: unknown,
  legacyEvmChains?: unknown,
): ChainConfig[] {
  const hasNew = raw !== undefined && raw !== '';
  const hasLegacy = legacyEvmChains !== undefined && legacyEvmChains !== '';
  if (hasNew && hasLegacy) {
    throw new Error('Set CHAINS or EVM_CHAINS, not both');
  }

  const entries = hasNew
    ? parseList(raw, 'CHAINS')
    : hasLegacy
      ? parseList(legacyEvmChains, 'EVM_CHAINS').map(fromLegacyEvmEntry)
      : [];
  const chains = entries.map(parseChain);

  const keys = new Set(chains.map((chain) => chain.key));
  if (keys.size !== chains.length) {
    throw new Error('CHAINS: every chain needs a different key');
  }
  return chains;
}
