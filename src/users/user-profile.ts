import type { User, Wallet } from '../generated/prisma/client.js';

/** A user as the front expects it (see `currentUserData.js` in the front). */
export interface UserProfile {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  verified: boolean;
  bio: string;
  walletAddress: string | null;
  joinedAt: string;
}

export function toUserProfile(user: User & { wallets: Wallet[] }): UserProfile {
  const primaryWallet =
    user.wallets.find((wallet) => wallet.isPrimary) ?? user.wallets[0];

  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatar: user.avatarUrl,
    verified: user.verified,
    bio: user.bio,
    walletAddress: primaryWallet?.address ?? null,
    joinedAt: user.createdAt.toISOString(),
  };
}
