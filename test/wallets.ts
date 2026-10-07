import { generateKeyPairSync, sign } from 'node:crypto';
import bs58 from 'bs58';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export interface TestWallet {
  family: 'evm' | 'solana';
  address: string;
  sign(message: string): Promise<string>;
}

export function createEvmWallet(): TestWallet {
  const account = privateKeyToAccount(generatePrivateKey());
  return {
    family: 'evm',
    address: account.address,
    sign: (message) => account.signMessage({ message }),
  };
}

export function createSolanaWallet(): TestWallet {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  // The raw key is the last 32 bytes of the SPKI encoding.
  const rawPublicKey = publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32);
  return {
    family: 'solana',
    address: bs58.encode(rawPublicKey),
    sign: async (message) =>
      bs58.encode(sign(null, Buffer.from(message, 'utf8'), privateKey)),
  };
}
