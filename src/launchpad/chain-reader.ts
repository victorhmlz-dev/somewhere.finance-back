import { createPublicClient, http, type Hex } from 'viem';
import type { LaunchpadChainConfig } from '../config/chains.js';

/** A contract event as the chain stores it, before decoding. */
export interface ChainLog {
  address: Hex;
  topics: [Hex, ...Hex[]] | [];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

export interface ChainBlock {
  hash: Hex;
  /** Seconds since 1970. */
  timestamp: bigint;
}

/** The little the indexer needs from a chain. Tests replace it with a fake. */
export interface ChainReader {
  getBlockNumber(): Promise<bigint>;
  getBlock(blockNumber: bigint): Promise<ChainBlock>;
  /** Events emitted by any of `addresses` between the two blocks, inclusive. */
  getLogs(range: {
    addresses: Hex[];
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<ChainLog[]>;
}

export type ChainReaderFactory = (chain: LaunchpadChainConfig) => ChainReader;

/** Token under which the factory is provided, so tests can swap it. */
export const CHAIN_READER_FACTORY = Symbol('CHAIN_READER_FACTORY');

export const createRpcChainReader: ChainReaderFactory = (chain) => {
  const client = createPublicClient({ transport: http(chain.rpcUrl) });

  return {
    getBlockNumber: () => client.getBlockNumber(),
    async getBlock(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      return { hash: block.hash, timestamp: block.timestamp };
    },
    async getLogs({ addresses, fromBlock, toBlock }) {
      const logs = await client.getLogs({
        address: addresses,
        fromBlock,
        toBlock,
      });
      return logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      }));
    },
  };
};
