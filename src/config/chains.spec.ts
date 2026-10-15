import { hasLaunchpad, parseChains } from './chains.js';

const evm = {
  key: 'sepolia',
  family: 'evm',
  chainId: 11155111,
  rpcUrl: 'https://rpc.example.com',
  launchpad: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
};
const solana = {
  key: 'solana-devnet',
  family: 'solana',
  cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
};

describe('parseChains', () => {
  it('reads no chains when nothing is set', () => {
    expect(parseChains(undefined, undefined)).toEqual([]);
    expect(parseChains('', '')).toEqual([]);
  });

  it('reads chains of every family, filling in what is optional', () => {
    expect(parseChains(JSON.stringify([evm, solana]))).toEqual([
      {
        key: 'sepolia',
        family: 'evm',
        name: 'sepolia',
        nativeCurrency: { symbol: 'ETH', name: 'Ether', decimals: 18 },
        rpcUrl: 'https://rpc.example.com',
        chainId: 11155111,
        launchpad: '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0',
        startBlock: 0,
        confirmations: 0,
        logBlockRange: 2000,
      },
      {
        key: 'solana-devnet',
        family: 'solana',
        name: 'solana-devnet',
        nativeCurrency: { symbol: 'SOL', name: 'Solana', decimals: 9 },
        rpcUrl: 'https://api.devnet.solana.com',
        cluster: 'devnet',
      },
    ]);
  });

  it('keeps the currency of a chain that pays fees in something else', () => {
    const [bnb] = parseChains(
      JSON.stringify([
        {
          ...evm,
          key: 'bsc',
          nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
        },
      ]),
    );
    expect(bnb.nativeCurrency).toEqual({
      symbol: 'BNB',
      name: 'BNB',
      decimals: 18,
    });
  });

  it('still reads the older EVM_CHAINS, with nativeSymbol', () => {
    const { family: _family, ...legacy } = evm;
    const [chain] = parseChains(
      undefined,
      JSON.stringify([
        { ...legacy, nativeSymbol: 'ETH', confirmations: 5, logBlockRange: 10 },
      ]),
    );
    expect(chain).toMatchObject({
      family: 'evm',
      nativeCurrency: { symbol: 'ETH', decimals: 18 },
      confirmations: 5,
      logBlockRange: 10,
    });
  });

  it('tells which chains have a launchpad to read', () => {
    const { launchpad: _launchpad, ...noLaunchpad } = evm;
    const chains = parseChains(
      JSON.stringify([evm, { ...noLaunchpad, key: 'other' }, solana]),
    );
    expect(chains.filter(hasLaunchpad).map((chain) => chain.key)).toEqual([
      'sepolia',
    ]);
  });

  it.each([
    ['text that is not JSON', 'nope', /valid JSON/],
    ['JSON that is not a list', '{}', /JSON list/],
    ['an unknown family', [{ ...evm, family: 'bitcoin' }], /family/],
    ['a key with capitals', [{ ...evm, key: 'Sepolia' }], /key/],
    [
      'an EVM chain without chain id',
      [{ ...evm, chainId: undefined }],
      /chainId/,
    ],
    ['an invalid node URL', [{ ...evm, rpcUrl: 'nope' }], /rpcUrl/],
    ['an invalid address', [{ ...evm, launchpad: '0x123' }], /launchpad/],
    ['a negative start block', [{ ...evm, startBlock: -1 }], /startBlock/],
    ['a block range of zero', [{ ...evm, logBlockRange: 0 }], /logBlockRange/],
    [
      'currency decimals out of range',
      [{ ...evm, nativeCurrency: { symbol: 'X', decimals: 99 } }],
      /decimals/,
    ],
    ['an unknown Solana cluster', [{ ...solana, cluster: 'moon' }], /cluster/],
    [
      'a launchpad on Solana',
      [{ ...solana, launchpad: evm.launchpad }],
      /Solana/,
    ],
    ['the same key twice', [evm, evm], /different key/],
  ])('rejects %s', (_case, value, error) => {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    expect(() => parseChains(raw)).toThrow(error);
  });

  it('refuses CHAINS and EVM_CHAINS together', () => {
    expect(() =>
      parseChains(JSON.stringify([evm]), JSON.stringify([evm])),
    ).toThrow(/not both/);
  });
});
