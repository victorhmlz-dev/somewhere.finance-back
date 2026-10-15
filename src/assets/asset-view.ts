import type { Asset } from '../generated/prisma/client.js';
import type { AssetKind } from '../generated/prisma/enums.js';

/**
 * An asset as the front shows it. Every amount in the API is an integer in
 * the smallest unit of its asset; `decimals` says where the point goes.
 */
export interface AssetView {
  chainKey: string;
  /** The token's address or mint. Null for the chain's own currency. */
  address: string | null;
  symbol: string;
  name: string;
  decimals: number;
  kind: AssetKind;
  /** Who issues it, for stocks and other real-world assets. */
  issuer: string | null;
  /** Whether the issuer can freeze, pause or take balances of it. */
  canFreeze: boolean;
}

/** How the address column marks a chain's own currency. */
export const NATIVE_ADDRESS = 'native';

export function toAssetView(asset: Asset): AssetView {
  return {
    chainKey: asset.chainKey,
    address: asset.address === NATIVE_ADDRESS ? null : asset.address,
    symbol: asset.symbol,
    name: asset.name,
    decimals: asset.decimals,
    kind: asset.kind,
    issuer: asset.issuer,
    canFreeze: asset.canFreeze,
  };
}
