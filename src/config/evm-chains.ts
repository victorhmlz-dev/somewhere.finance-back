/** One EVM chain the back reads the launchpad from. */
export interface EvmChainConfig {
  /** Name the API and the front use for the chain, e.g. "ethereum". */
  key: string;
  chainId: number;
  /** Shown to users, e.g. "Ethereum". */
  name: string;
  /** Symbol of the currency launches are paid in, e.g. "ETH". */
  nativeSymbol: string;
  rpcUrl: string;
  /** Address of the Launchpad contract, in lowercase. */
  launchpad: `0x${string}`;
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

const KEY_PATTERN = /^[a-z0-9-]{1,32}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Reads EVM_CHAINS, a JSON list of chains. Empty or missing means no chain is
 * read, which is how the API runs when only its social part is needed.
 */
export function parseEvmChains(raw: unknown): EvmChainConfig[] {
  if (raw === undefined || raw === '') return [];
  if (typeof raw !== 'string') throw new Error('EVM_CHAINS must be a string');

  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error('EVM_CHAINS must be valid JSON');
  }
  if (!Array.isArray(list)) throw new Error('EVM_CHAINS must be a JSON list');

  const chains = list.map((entry: Record<string, unknown>, index) => {
    const fail = (problem: string): never => {
      throw new Error(`EVM_CHAINS[${index}]: ${problem}`);
    };
    if (typeof entry !== 'object' || entry === null) fail('must be an object');

    const { key, chainId, rpcUrl, launchpad } = entry;
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      fail('key must be lowercase letters, numbers or dashes');
    }
    if (!isCount(chainId) || chainId === 0) fail('chainId must be a number');
    if (typeof rpcUrl !== 'string' || !URL.canParse(rpcUrl)) {
      fail('rpcUrl must be a valid URL');
    }
    if (typeof launchpad !== 'string' || !ADDRESS_PATTERN.test(launchpad)) {
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
      key: key as string,
      chainId: chainId as number,
      name: typeof entry.name === 'string' ? entry.name : (key as string),
      nativeSymbol:
        typeof entry.nativeSymbol === 'string' ? entry.nativeSymbol : 'ETH',
      rpcUrl: rpcUrl as string,
      launchpad: (launchpad as string).toLowerCase() as `0x${string}`,
      startBlock: startBlock as number,
      confirmations: confirmations as number,
      logBlockRange: logBlockRange as number,
    };
  });

  const keys = new Set(chains.map((chain) => chain.key));
  if (keys.size !== chains.length) {
    throw new Error('EVM_CHAINS: every chain needs a different key');
  }
  return chains;
}
