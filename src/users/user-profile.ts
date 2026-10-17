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

/**
 * The signed-in user's own profile: also every wallet of the account. Only
 * shown to themselves: listing them publicly would tell anyone which wallets
 * belong to the same person.
 */
export interface OwnProfile extends UserProfile {
  wallets: { family: Wallet['family']; address: string; isPrimary: boolean }[];
}

export function toOwnProfile(user: User & { wallets: Wallet[] }): OwnProfile {
  return {
    ...toUserProfile(user),
    wallets: [...user.wallets]
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map(({ family, address, isPrimary }) => ({
        family,
        address,
        isPrimary,
      })),
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
