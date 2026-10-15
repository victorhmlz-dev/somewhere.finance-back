import type { Post, Prisma, User } from '../generated/prisma/client.js';
import type { ReactionCount } from '../reactions/reactions.service.js';
import { toUserSummary, type UserSummary } from '../users/user-profile.js';

const LAUNCH_SUMMARY = {
  select: { id: true, name: true, symbol: true, imageUrl: true },
} satisfies Prisma.LaunchDefaultArgs;

/** What has to be loaded with a post to build its `PostView`. */
export const POST_INCLUDE = {
  author: true,
  parent: { include: { author: true } },
  launch: LAUNCH_SUMMARY,
} satisfies Prisma.PostInclude;

export type PostRow = Post & {
  author: User;
  parent: (Post & { author: User }) | null;
  launch: Prisma.LaunchGetPayload<typeof LAUNCH_SUMMARY> | null;
};

/** The launch a post comments on, enough to show and link it. */
export interface PostLaunchView {
  id: string;
  name: string;
  symbol: string;
  image: string | null;
}

/** A post as the front expects it (see `feedPostData.js` in the front). */
export interface PostView {
  id: string;
  author: UserSummary;
  text: string;
  image: string | null;
  createdAt: string;
  /** Set when the post is a reply. */
  replyTo: { id: string; handle: string } | null;
  /** Set when the post is a comment on a launch, or a reply in one. */
  launch: PostLaunchView | null;
  stats: { replies: number; reposts: number; likes: number; views: number };
  /** Both are false for anonymous requests. */
  isLiked: boolean;
  isReposted: boolean;
  /** Every emoji reaction, with zero when nobody used it. */
  reactions: ReactionCount[];
}

export function toPostView(
  post: PostRow,
  viewer: { isLiked: boolean; isReposted: boolean },
  reactions: ReactionCount[],
): PostView {
  return {
    id: post.id,
    author: toUserSummary(post.author),
    text: post.text,
    image: post.imageUrl,
    createdAt: post.createdAt.toISOString(),
    replyTo: post.parent
      ? { id: post.parent.id, handle: post.parent.author.handle }
      : null,
    launch: post.launch
      ? {
          id: post.launch.id,
          name: post.launch.name,
          symbol: post.launch.symbol,
          image: post.launch.imageUrl,
        }
      : null,
    stats: {
      replies: post.repliesCount,
      reposts: post.repostsCount,
      likes: post.likesCount,
      views: post.viewsCount,
    },
    isLiked: viewer.isLiked,
    isReposted: viewer.isReposted,
    reactions,
  };
}
