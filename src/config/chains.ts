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

/** Versions of the Launchpad contract the API can read. */
export const LAUNCHPAD_VERSIONS = [2, 3] as const;
export type LaunchpadVersion = (typeof LAUNCHPAD_VERSIONS)[number];

/** One deployed Launchpad contract. */
export interface LaunchpadConfig {
  /** In lowercase. */
  address: `0x${string}`;
  /** 2 sells for the chain's currency; 3 for any asset it allows. */
  version: LaunchpadVersion;
  /** Block it was deployed in; the indexer starts there. */
  startBlock: number;
}

/** Kinds an asset can be labelled with; "native" is the chain's own currency. */
export const LABELLED_ASSET_KINDS = [
  'crypto',
  'stablecoin',
  'stock',
  'rwa',
] as const;

/**
 * What the chain cannot say about a token: whether it is a stablecoin, a
 * stock or another real-world asset, who issues it, and whether the issuer
 * can freeze or take balances. Symbol, name and decimals are read from the
 * token itself.
 */
export interface AssetLabel {
  /** In lowercase. */
  address: `0x${string}`;
  kind: (typeof LABELLED_ASSET_KINDS)[number];
  issuer: string | null;
  canFreeze: boolean;
}

/** An EVM chain, with the Launchpad contracts to read, if it has any. */
export interface EvmChainConfig extends BaseChainConfig {
  family: 'evm';
  chainId: number;
  /**
   * Every Launchpad whose launches are shown, oldest first. New launches are
   * created on the last one. Empty if the chain has none.
   */
  launchpads: LaunchpadConfig[];
  /** Labels for the tokens launches can be paired with. */
  assets: AssetLabel[];
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

/** An EVM chain with at least one Launchpad: what the indexer reads. */
export type LaunchpadChainConfig = EvmChainConfig;

export function hasLaunchpad(
  chain: ChainConfig,
): chain is LaunchpadChainConfig {
  return chain.family === 'evm' && chain.launchpads.length > 0;
}

/** The Launchpad new launches are created on: the last one listed. */
export function currentLaunchpad(chain: ChainConfig): LaunchpadConfig | null {
  return chain.family === 'evm' ? (chain.launchpads.at(-1) ?? null) : null;
}

const KEY_PATTERN = /^[a-z0-9-]{1,32}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const SOLANA_CLUSTERS = ['mainnet-beta', 'devnet', 'testnet'];

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isAddress = (value: unknown): value is string =>
  typeof value === 'string' && ADDRESS_PATTERN.test(value);

const lowerAddress = (value: string) => value.toLowerCase() as `0x${string}`;

type Entry = Record<string, unknown>;

/**
 * `launchpads`, or the older single `launchpad` with `startBlock`, which is
 * read as a version 2 Launchpad.
 */
function parseLaunchpads(
  entry: Entry,
  fail: (problem: string) => never,
): LaunchpadConfig[] {
  if (entry.launchpads !== undefined && entry.launchpad !== undefined) {
    fail('set launchpads or launchpad, not both');
  }
  const raw =
    entry.launchpads ??
    (entry.launchpad === undefined
      ? []
      : [
          {
            address: entry.launchpad,
            version: 2,
            startBlock: entry.startBlock,
          },
        ]);
  if (!Array.isArray(raw)) fail('launchpads must be a list');

  const launchpads = (raw as Entry[]).map((item, index) => {
    const where = `launchpads[${index}]`;
    if (typeof item !== 'object' || item === null)
      fail(`${where} must be an object`);
    if (!isAddress(item.address))
      fail(`${where}.address must be a contract address`);
    if (!LAUNCHPAD_VERSIONS.includes(item.version as LaunchpadVersion)) {
      fail(`${where}.version must be one of: ${LAUNCHPAD_VERSIONS.join(', ')}`);
    }
    const startBlock = item.startBlock ?? 0;
    if (!isCount(startBlock))
      fail(`${where}.startBlock must be a block number`);
    return {
      address: lowerAddress(item.address as string),
      version: item.version as LaunchpadVersion,
      startBlock: startBlock as number,
    };
  });
  const addresses = new Set(launchpads.map((launchpad) => launchpad.address));
  if (addresses.size !== launchpads.length) {
    fail('every launchpad needs a different address');
  }
  return launchpads;
}

function parseAssetLabels(
  entry: Entry,
  fail: (problem: string) => never,
): AssetLabel[] {
  const raw = entry.assets ?? [];
  if (!Array.isArray(raw)) fail('assets must be a list');
  return (raw as Entry[]).map((item, index) => {
    const where = `assets[${index}]`;
    if (typeof item !== 'object' || item === null)
      fail(`${where} must be an object`);
    if (!isAddress(item.address))
      fail(`${where}.address must be a token address`);
    const kind = item.kind ?? 'crypto';
    if (!LABELLED_ASSET_KINDS.includes(kind as AssetLabel['kind'])) {
      fail(`${where}.kind must be one of: ${LABELLED_ASSET_KINDS.join(', ')}`);
    }
    if (item.issuer !== undefined && typeof item.issuer !== 'string') {
      fail(`${where}.issuer must be text`);
    }
    if (item.canFreeze !== undefined && typeof item.canFreeze !== 'boolean') {
      fail(`${where}.canFreeze must be true or false`);
    }
    return {
      address: lowerAddress(item.address as string),
      kind: kind as AssetLabel['kind'],
      issuer: (item.issuer as string | undefined) || null,
      canFreeze: item.canFreeze === true,
    };
  });
}

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
    if (entry.launchpad !== undefined || entry.launchpads !== undefined) {
      fail('launchpads on Solana are not read yet');
    }
    return { ...base, family: 'solana', cluster: cluster as string };
  }

  const { chainId } = entry;
  if (!isCount(chainId) || chainId === 0) fail('chainId must be a number');
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
    launchpads: parseLaunchpads(entry, fail),
    assets: parseAssetLabels(entry, fail),
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
