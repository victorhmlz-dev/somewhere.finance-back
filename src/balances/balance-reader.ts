import { createPublicClient, http, parseAbi, type Hex } from 'viem';
import type { EvmChainConfig } from '../config/chains.js';

/** What the balances need from a chain. Tests replace it with a fake. */
export interface BalanceReader {
  getNativeBalance(owner: Hex): Promise<bigint>;
  getTokenBalance(token: Hex, owner: Hex): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
  /** The reserves of a Uniswap V2 pair, with the token each one is of. */
  getPairReserves(pair: Hex): Promise<{
    token0: Hex;
    reserve0: bigint;
    reserve1: bigint;
  }>;
}

export type BalanceReaderFactory = (chain: EvmChainConfig) => BalanceReader;

/** Token under which the factory is provided, so tests can swap it. */
export const BALANCE_READER_FACTORY = Symbol('BALANCE_READER_FACTORY');

const ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function token0() view returns (address)',
  'function getReserves() view returns (uint112, uint112, uint32)',
]);

export const createRpcBalanceReader: BalanceReaderFactory = (chain) => {
  const client = createPublicClient({ transport: http(chain.rpcUrl) });
  return {
    getNativeBalance: (owner) => client.getBalance({ address: owner }),
    getTokenBalance: (token, owner) =>
      client.readContract({
        address: token,
        abi: ABI,
        functionName: 'balanceOf',
        args: [owner],
      }),
    getGasPrice: () => client.getGasPrice(),
    async getPairReserves(pair) {
      const [token0, [reserve0, reserve1]] = await Promise.all([
        client.readContract({
          address: pair,
          abi: ABI,
          functionName: 'token0',
        }),
        client.readContract({
          address: pair,
          abi: ABI,
          functionName: 'getReserves',
        }),
      ]);
      return { token0, reserve0, reserve1 };
    },
  };
};
