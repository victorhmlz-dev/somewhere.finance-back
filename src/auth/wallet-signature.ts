import { createPublicKey, verify } from 'node:crypto';
import bs58 from 'bs58';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import type { WalletFamily } from '../generated/prisma/enums.js';

const STATEMENT = 'Sign in to Somewhere Finance.';

// DER header that turns a raw 32-byte Ed25519 public key into an SPKI key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Returns the address in the form it is stored in, or null if it is not a
 * valid address for that family.
 */
export function normalizeAddress(
  family: WalletFamily,
  address: string,
): string | null {
  if (family === 'evm') {
    return isAddress(address, { strict: false }) ? address.toLowerCase() : null;
  }

  try {
    const bytes = bs58.decode(address);
    return bytes.length === 32 ? bs58.encode(bytes) : null;
  } catch {
    return null;
  }
}

export interface SignInMessageParams {
  family: WalletFamily;
  /** Normalized address, as returned by `normalizeAddress`. */
  address: string;
  /** Host of the front, shown by the wallet so the user can spot phishing. */
  domain: string;
  uri: string;
  /** EVM chain the wallet is connected to. Ignored for Solana. */
  chainId: number;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

/**
 * Builds the text the wallet signs. EVM uses EIP-4361 (Sign-In with Ethereum),
 * which wallets recognize and display as a login request. Solana has no
 * equivalent standard for plain `signMessage`, so it gets the same layout.
 */
export function buildSignInMessage(params: SignInMessageParams): string {
  const { family, address, domain, uri, chainId, nonce, issuedAt, expiresAt } =
    params;

  if (family === 'evm') {
    return createSiweMessage({
      address: getAddress(address),
      chainId,
      domain,
      nonce,
      uri,
      version: '1',
      statement: STATEMENT,
      issuedAt,
      expirationTime: expiresAt,
    });
  }

  return [
    `${domain} wants you to sign in with your Solana account:`,
    address,
    '',
    STATEMENT,
    '',
    `URI: ${uri}`,
    'Version: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt.toISOString()}`,
    `Expiration Time: ${expiresAt.toISOString()}`,
  ].join('\n');
}

export interface WalletSignatureParams {
  family: WalletFamily;
  /** Normalized address, as returned by `normalizeAddress`. */
  address: string;
  message: string;
  /** EVM: 0x-prefixed hex. Solana: base58. */
  signature: string;
}

/**
 * Checks that `signature` is `message` signed by the key behind `address`.
 * Never throws: a malformed signature is simply not valid.
 *
 * EVM verification covers regular (EOA) wallets only. Smart-contract wallets
 * sign through ERC-1271, which needs an RPC call and belongs to the on-chain
 * phase.
 */
export async function verifyWalletSignature(
  params: WalletSignatureParams,
): Promise<boolean> {
  const { family, address, message, signature } = params;

  try {
    if (family === 'evm') {
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
      return await verifyMessage({
        address: getAddress(address),
        message,
        signature: signature as `0x${string}`,
      });
    }

    const signatureBytes = bs58.decode(signature);
    if (signatureBytes.length !== 64) return false;
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, bs58.decode(address)]),
      format: 'der',
      type: 'spki',
    });
    return verify(
      null,
      Buffer.from(message, 'utf8'),
      publicKey,
      signatureBytes,
    );
  } catch {
    return false;
  }
}
