import type { Post, Prisma, User } from '../generated/prisma/client.js';
import { toUserSummary, type UserSummary } from '../users/user-profile.js';

/** What has to be loaded with a post to build its `PostView`. */
export const POST_INCLUDE = {
  author: true,
  parent: { include: { author: true } },
} satisfies Prisma.PostInclude;

export type PostRow = Post & {
  author: User;
  parent: (Post & { author: User }) | null;
};

/** A post as the front expects it (see `feedPostData.js` in the front). */
export interface PostView {
  id: string;
  author: UserSummary;
  text: string;
  image: string | null;
  createdAt: string;
  /** Set when the post is a reply. */
  replyTo: { id: string; handle: string } | null;
  stats: { replies: number; reposts: number; likes: number; views: number };
  /** Both are false for anonymous requests. */
  isLiked: boolean;
  isReposted: boolean;
}

export function toPostView(
  post: PostRow,
  viewer: { isLiked: boolean; isReposted: boolean },
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
    stats: {
      replies: post.repliesCount,
      reposts: post.repostsCount,
      likes: post.likesCount,
      views: post.viewsCount,
    },
    isLiked: viewer.isLiked,
    isReposted: viewer.isReposted,
  };
}
