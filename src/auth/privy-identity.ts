import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { WalletFamily } from '../generated/prisma/enums.js';
import { normalizeAddress } from './wallet-signature.js';

/** Token under which the keys Privy signs with are provided, so tests can swap them. */
export const PRIVY_KEYS = Symbol('PRIVY_KEYS');

/** The public keys of a Privy app, fetched from Privy and cached by jose. */
export function privyKeysOf(appId: string): JWTVerifyGetKey {
  return createRemoteJWKSet(
    new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`),
  );
}

/** A wallet linked to a Privy user, which Privy already checked is theirs. */
export interface LinkedWallet {
  family: WalletFamily;
  address: string;
}

/** Who a valid identity token says the user is. */
export interface PrivyIdentity {
  /** Privy's id of the user, "did:privy:…". */
  subject: string;
  /** Every wallet linked to the user, in Privy's order. */
  wallets: LinkedWallet[];
}

const CHAIN_FAMILIES: Record<string, WalletFamily> = {
  ethereum: 'evm',
  solana: 'solana',
};

/**
 * Checks an identity token: signed by Privy for this app, not expired. It
 * says who the user is and which wallets they linked: for an external wallet
 * Privy had it sign a message, and an embedded wallet Privy created itself.
 * Returns null for any token that is not valid.
 */
export async function verifyPrivyIdentityToken(
  token: string,
  appId: string,
  keys: JWTVerifyGetKey,
): Promise<PrivyIdentity | null> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer: 'privy.io',
      audience: appId,
      algorithms: ['ES256'],
    }));
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || !payload.sub) return null;

  // A list in text, with every linked account; only wallets are kept
  let accounts: unknown = [];
  try {
    accounts =
      typeof payload.linked_accounts === 'string'
        ? JSON.parse(payload.linked_accounts)
        : [];
  } catch {
    accounts = [];
  }

  const wallets: LinkedWallet[] = [];
  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (account?.type !== 'wallet') continue;
    const family = CHAIN_FAMILIES[account.chain_type as string];
    const address =
      family && typeof account.address === 'string'
        ? normalizeAddress(family, account.address)
        : null;
    if (family && address) wallets.push({ family, address });
  }
  return { subject: payload.sub, wallets };
}
