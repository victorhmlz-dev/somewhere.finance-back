import { parseEvmChains } from './evm-chains.js';

const chain = {
  key: 'sepolia',
  chainId: 11155111,
  rpcUrl: 'https://rpc.example.com',
  launchpad: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
};

describe('parseEvmChains', () => {
  it('reads no chains when the variable is missing or empty', () => {
    expect(parseEvmChains(undefined)).toEqual([]);
    expect(parseEvmChains('')).toEqual([]);
  });

  it('reads a chain, filling in what is optional and lowercasing the address', () => {
    expect(parseEvmChains(JSON.stringify([chain]))).toEqual([
      {
        key: 'sepolia',
        chainId: 11155111,
        name: 'sepolia',
        nativeSymbol: 'ETH',
        rpcUrl: 'https://rpc.example.com',
        launchpad: '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0',
        startBlock: 0,
        confirmations: 0,
      },
    ]);
  });

  it('keeps what is given', () => {
    const [parsed] = parseEvmChains(
      JSON.stringify([
        {
          ...chain,
          name: 'Sepolia',
          nativeSymbol: 'SEP',
          startBlock: 100,
          confirmations: 5,
        },
      ]),
    );
    expect(parsed).toMatchObject({
      name: 'Sepolia',
      nativeSymbol: 'SEP',
      startBlock: 100,
      confirmations: 5,
    });
  });

  it.each([
    ['text that is not JSON', 'nope', /valid JSON/],
    ['JSON that is not a list', '{}', /JSON list/],
    ['a key with capitals', [{ ...chain, key: 'Sepolia' }], /key/],
    ['a missing chain id', [{ ...chain, chainId: undefined }], /chainId/],
    ['an invalid node URL', [{ ...chain, rpcUrl: 'nope' }], /rpcUrl/],
    ['an invalid address', [{ ...chain, launchpad: '0x123' }], /launchpad/],
    ['a negative start block', [{ ...chain, startBlock: -1 }], /startBlock/],
    ['the same key twice', [chain, chain], /different key/],
  ])('rejects %s', (_case, value, error) => {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    expect(() => parseEvmChains(raw)).toThrow(error);
  });
});
