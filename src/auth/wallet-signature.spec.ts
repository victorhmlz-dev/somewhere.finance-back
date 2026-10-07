import { createEvmWallet, createSolanaWallet } from '../../test/wallets.js';
import {
  buildSignInMessage,
  normalizeAddress,
  verifyWalletSignature,
} from './wallet-signature.js';

const messageFor = (family: 'evm' | 'solana', address: string) =>
  buildSignInMessage({
    family,
    address,
    domain: 'localhost:3000',
    uri: 'http://localhost:3000',
    chainId: 1,
    nonce: 'a1b2c3d4e5f6a7b8',
    issuedAt: new Date('2026-10-07T10:00:00Z'),
    expiresAt: new Date('2026-10-07T10:05:00Z'),
  });

describe('normalizeAddress', () => {
  it('lowercases EVM addresses', () => {
    expect(
      normalizeAddress('evm', '0x5D6e7F8a9B0c1D2e3F4a5B6c7D8e9F0a1B2c3D4e'),
    ).toBe('0x5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e');
  });

  it('rejects malformed EVM addresses', () => {
    expect(normalizeAddress('evm', '0x1234')).toBeNull();
    expect(normalizeAddress('evm', 'not-an-address')).toBeNull();
  });

  it('keeps valid Solana addresses as they are', () => {
    const { address } = createSolanaWallet();
    expect(normalizeAddress('solana', address)).toBe(address);
  });

  it('rejects Solana addresses that are not 32 bytes of base58', () => {
    expect(normalizeAddress('solana', 'abc')).toBeNull();
    expect(normalizeAddress('solana', '0OIl')).toBeNull();
  });

  it('does not accept an address of the other family', () => {
    expect(normalizeAddress('solana', createEvmWallet().address)).toBeNull();
    expect(normalizeAddress('evm', createSolanaWallet().address)).toBeNull();
  });
});

describe('buildSignInMessage', () => {
  it('builds an EIP-4361 message for EVM', () => {
    const address = '0x5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e';
    expect(messageFor('evm', address)).toBe(
      [
        'localhost:3000 wants you to sign in with your Ethereum account:',
        // EIP-4361 requires the checksummed (EIP-55) form of the address.
        '0x5d6e7f8a9b0c1D2e3f4A5B6c7D8e9F0A1b2c3d4e',
        '',
        'Sign in to Somewhere Finance.',
        '',
        'URI: http://localhost:3000',
        'Version: 1',
        'Chain ID: 1',
        'Nonce: a1b2c3d4e5f6a7b8',
        'Issued At: 2026-10-07T10:00:00.000Z',
        'Expiration Time: 2026-10-07T10:05:00.000Z',
      ].join('\n'),
    );
  });

  it('builds the equivalent message for Solana', () => {
    const { address } = createSolanaWallet();
    const message = messageFor('solana', address);
    expect(message).toContain('wants you to sign in with your Solana account:');
    expect(message).toContain(address);
    expect(message).toContain('Nonce: a1b2c3d4e5f6a7b8');
  });
});

describe('verifyWalletSignature', () => {
  describe.each([
    ['evm', createEvmWallet],
    ['solana', createSolanaWallet],
  ] as const)('%s', (family, createWallet) => {
    it('accepts a signature from the owner of the address', async () => {
      const wallet = createWallet();
      const address = normalizeAddress(family, wallet.address)!;
      const message = messageFor(family, address);
      const signature = await wallet.sign(message);

      await expect(
        verifyWalletSignature({ family, address, message, signature }),
      ).resolves.toBe(true);
    });

    it('rejects a signature made by another wallet', async () => {
      const address = normalizeAddress(family, createWallet().address)!;
      const message = messageFor(family, address);
      const signature = await createWallet().sign(message);

      await expect(
        verifyWalletSignature({ family, address, message, signature }),
      ).resolves.toBe(false);
    });

    it('rejects a signature of a different message', async () => {
      const wallet = createWallet();
      const address = normalizeAddress(family, wallet.address)!;
      const message = messageFor(family, address);
      const signature = await wallet.sign(message + ' ');

      await expect(
        verifyWalletSignature({ family, address, message, signature }),
      ).resolves.toBe(false);
    });

    it('rejects a malformed signature without throwing', async () => {
      const address = normalizeAddress(family, createWallet().address)!;
      const message = messageFor(family, address);

      await expect(
        verifyWalletSignature({ family, address, message, signature: 'nope' }),
      ).resolves.toBe(false);
    });
  });
});
