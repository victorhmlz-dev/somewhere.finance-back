import type { User, Wallet } from '../generated/prisma/client.js';

/** A user as shown in lists: followers, following, post authors. */
export interface UserSummary {
  id: string;
  name: string;
  handle: string;
  avatar: string | null;
  verified: boolean;
  bio: string;
}

/** A user as the front expects it (see `currentUserData.js` in the front). */
export interface UserProfile extends UserSummary {
  walletAddress: string | null;
  joinedAt: string;
  followingCount: number;
  followersCount: number;
}

export function toUserSummary(user: User): UserSummary {
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    avatar: user.avatarUrl,
    verified: user.verified,
    bio: user.bio,
  };
}

export function toUserProfile(user: User & { wallets: Wallet[] }): UserProfile {
  const primaryWallet =
    user.wallets.find((wallet) => wallet.isPrimary) ?? user.wallets[0];

  return {
    ...toUserSummary(user),
    walletAddress: primaryWallet?.address ?? null,
    joinedAt: user.createdAt.toISOString(),
    followingCount: user.followingCount,
    followersCount: user.followersCount,
  };
}
