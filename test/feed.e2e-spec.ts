import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { TimelineItem, Trend } from '../src/feed/feed.service.js';
import type { PostView } from '../src/posts/post-view.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { apiClient, signIn, type TestSession } from './session.js';
import { createEvmWallet } from './wallets.js';

// Needs the database from `npm run db:up`. Other data may live in it, so the
// tests about lists shared by everyone only look at what they created.
describe('Feed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdAddresses: string[] = [];

  const newUser = async () => {
    const wallet = createEvmWallet();
    createdAddresses.push(wallet.address, wallet.address.toLowerCase());
    return signIn(app, wallet);
  };

  const api = (session?: TestSession) => apiClient(app, session);

  const publish = async (
    session: TestSession,
    text: string,
    replyToId?: string,
  ): Promise<PostView> => {
    const response = await api(session)
      .post('/posts')
      .send({ text, replyToId })
      .expect(201);
    return response.body;
  };

  const follow = (session: TestSession, target: TestSession) =>
    api(session).put(`/users/${target.user.handle}/follow`).expect(200);

  const repost = (session: TestSession, post: PostView) =>
    api(session).put(`/posts/${post.id}/repost`).expect(200);

  /** What a timeline shows, as `[post id, handle of who reposted it]`. */
  const entries = (items: TimelineItem[]) =>
    items.map((item) => [item.post.id, item.repostedBy?.handle ?? null]);

  const uniqueTag = () => `Tag${randomBytes(6).toString('hex')}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Remove only what this run created, so a dev database keeps its data.
    await prisma.user.deleteMany({
      where: { wallets: { some: { address: { in: createdAddresses } } } },
    });
    await prisma.authChallenge.deleteMany({
      where: { address: { in: createdAddresses } },
    });
    await app.close();
  });

  describe('my network', () => {
    it('shows posts and reposts by me and by who I follow, newest first', async () => {
      const me = await newUser();
      const aria = await newUser();
      const marcus = await newUser();
      const stranger = await newUser();
      await follow(me, aria);
      await follow(me, marcus);

      const fromAria = await publish(aria, 'Posted by someone I follow.');
      const fromStranger = await publish(stranger, 'Posted by a stranger.');
      await publish(stranger, 'Never reaches my network.');
      await publish(marcus, 'A reply does not show up.', fromAria.id);
      const mine = await publish(me, 'Posted by me.');
      await repost(marcus, fromStranger);
      await repost(stranger, fromAria);

      const feed = await api(me).get('/feed/network').expect(200);
      expect(entries(feed.body.items)).toEqual([
        [fromStranger.id, marcus.user.handle],
        [mine.id, null],
        [fromAria.id, null],
      ]);
      expect(feed.body.nextCursor).toBeNull();

      const reposted: TimelineItem = feed.body.items[0];
      expect(reposted.id).not.toBe(fromStranger.id);
      expect(reposted.repostedBy).toEqual({
        id: marcus.user.id,
        name: marcus.user.name,
        handle: marcus.user.handle,
        avatar: null,
        verified: false,
        bio: '',
      });
      expect(reposted.post).toMatchObject({
        text: 'Posted by a stranger.',
        author: { handle: stranger.user.handle },
        stats: { reposts: 1, views: 1 },
        isReposted: false,
      });
    });

    it('pages through the timeline without repeating or skipping', async () => {
      const me = await newUser();
      const aria = await newUser();
      await follow(me, aria);
      const first = await publish(aria, 'One.');
      const second = await publish(me, 'Two.');
      await repost(aria, second);
      const third = await publish(aria, 'Three.');

      const firstPage = await api(me).get('/feed/network?limit=2').expect(200);
      expect(entries(firstPage.body.items)).toEqual([
        [third.id, null],
        [second.id, aria.user.handle],
      ]);

      const secondPage = await api(me)
        .get(`/feed/network?limit=2&cursor=${firstPage.body.nextCursor}`)
        .expect(200);
      expect(entries(secondPage.body.items)).toEqual([
        [second.id, null],
        [first.id, null],
      ]);
      expect(secondPage.body.nextCursor).toBeNull();
    });

    it('drops what was unfollowed, undone or deleted', async () => {
      const me = await newUser();
      const aria = await newUser();
      const marcus = await newUser();
      const stranger = await newUser();
      await follow(me, aria);
      await follow(me, marcus);
      const kept = await publish(aria, 'Stays.');
      const deleted = await publish(aria, 'Gets deleted.');
      const undone = await publish(stranger, 'Repost gets undone.');
      const gone = await publish(stranger, 'Deleted after the repost.');
      await publish(marcus, 'Unfollowed later.');
      await repost(aria, undone);
      await repost(aria, gone);

      await api(aria).delete(`/posts/${deleted.id}`).expect(204);
      await api(aria).delete(`/posts/${undone.id}/repost`).expect(200);
      await api(stranger).delete(`/posts/${gone.id}`).expect(204);
      await api(me).delete(`/users/${marcus.user.handle}/follow`).expect(200);

      const feed = await api(me).get('/feed/network').expect(200);
      expect(entries(feed.body.items)).toEqual([[kept.id, null]]);
    });

    it('requires a session', async () => {
      await api().get('/feed/network').expect(401);
    });
  });

  describe('discover', () => {
    it('shows posts by anyone to anyone, without replies or reposts', async () => {
      const aria = await newUser();
      const marcus = await newUser();
      const older = await publish(aria, 'Older.');
      const newer = await publish(marcus, 'Newer.');
      const reply = await publish(aria, 'A reply.', newer.id);
      await repost(aria, older);
      await api(aria).put(`/posts/${newer.id}/like`).expect(200);

      const feed = await api(aria).get('/feed/discover?limit=50').expect(200);
      const mine = (feed.body.items as TimelineItem[]).filter((item) =>
        [older.id, newer.id, reply.id].includes(item.post.id),
      );
      expect(entries(mine)).toEqual([
        [newer.id, null],
        [older.id, null],
      ]);
      expect(mine[0]).toMatchObject({
        id: newer.id,
        post: { isLiked: true, isReposted: false },
      });
      expect(mine[1].post.isReposted).toBe(true);

      const anonymous = await api().get('/feed/discover?limit=1').expect(200);
      expect(anonymous.body.items).toHaveLength(1);
      expect(anonymous.body.nextCursor).toEqual(expect.any(String));
    });
  });

  describe('posts of a user', () => {
    it('lists their posts and reposts newest first, without replies', async () => {
      const aria = await newUser();
      const marcus = await newUser();
      const oldest = await publish(aria, 'One.');
      const fromMarcus = await publish(marcus, 'Not hers.');
      const newest = await publish(aria, 'Two.');
      await publish(aria, 'A reply.', oldest.id);
      await repost(aria, fromMarcus);

      const path = `/users/${aria.user.handle.toUpperCase()}/posts`;
      const firstPage = await api(marcus).get(`${path}?limit=2`).expect(200);
      expect(entries(firstPage.body.items)).toEqual([
        [fromMarcus.id, aria.user.handle],
        [newest.id, null],
      ]);

      const secondPage = await api(marcus)
        .get(`${path}?limit=2&cursor=${firstPage.body.nextCursor}`)
        .expect(200);
      expect(entries(secondPage.body.items)).toEqual([[oldest.id, null]]);
      expect(secondPage.body.nextCursor).toBeNull();

      // Each time a post is served in a list counts as one more view.
      const again = await api().get(`${path}?limit=2`).expect(200);
      expect(again.body.items[1].post.stats.views).toBe(2);
    });

    it('answers 404 for a user that does not exist', async () => {
      await api().get('/users/nobody_at_all/posts').expect(404);
    });
  });

  describe('hashtags', () => {
    it('lists the posts and replies of a hashtag, in any case, page by page', async () => {
      const aria = await newUser();
      const tag = uniqueTag();
      const first = await publish(aria, `Minting today. #${tag}`);
      const second = await publish(
        aria,
        `Me too #${tag.toUpperCase()}!`,
        first.id,
      );
      const third = await publish(aria, `#${tag} twice is once #${tag}`);
      await publish(aria, `No hashtag here, just ${tag}.`);

      const path = `/hashtags/${tag.toLowerCase()}/posts`;
      const firstPage = await api().get(`${path}?limit=2`).expect(200);
      expect(entries(firstPage.body.items)).toEqual([
        [third.id, null],
        [second.id, null],
      ]);
      const secondPage = await api()
        .get(`${path}?limit=2&cursor=${firstPage.body.nextCursor}`)
        .expect(200);
      expect(entries(secondPage.body.items)).toEqual([[first.id, null]]);
      expect(secondPage.body.nextCursor).toBeNull();

      await api(aria).delete(`/posts/${third.id}`).expect(204);
      const afterDelete = await api()
        .get(`/hashtags/${tag.toUpperCase()}/posts`)
        .expect(200);
      expect(entries(afterDelete.body.items)).toEqual([
        [second.id, null],
        [first.id, null],
      ]);
    });

    it('answers an empty page for a hashtag nobody used', async () => {
      const response = await api()
        .get(`/hashtags/${uniqueTag()}/posts`)
        .expect(200);
      expect(response.body).toEqual({ items: [], nextCursor: null });
    });

    it('ranks trends by posts in the last 24 hours', async () => {
      const aria = await newUser();
      const big = uniqueTag();
      const small = uniqueTag();
      const old = uniqueTag();
      await publish(aria, `#${big}`);
      await publish(aria, `#${big.toLowerCase()} again`);
      await publish(aria, `#${big} and #${small}`);
      const deleted = await publish(aria, `#${small} but deleted`);
      await api(aria).delete(`/posts/${deleted.id}`).expect(204);
      const stale = await publish(aria, `#${old}`);
      await prisma.post.update({
        where: { id: stale.id },
        data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });

      const response = await api()
        .get('/hashtags/trending?limit=20')
        .expect(200);
      const mine = (response.body.items as Trend[]).filter((trend) =>
        [big, small, old].map((tag) => tag.toLowerCase()).includes(trend.tag),
      );
      expect(mine).toEqual([
        { hashtag: `#${big}`, tag: big.toLowerCase(), postCount: 3 },
        { hashtag: `#${small}`, tag: small.toLowerCase(), postCount: 1 },
      ]);
    });

    it('rejects an invalid limit', async () => {
      await api().get('/hashtags/trending?limit=0').expect(400);
      await api().get('/hashtags/trending?limit=21').expect(400);
    });
  });

  describe('who to follow', () => {
    it('suggests the most followed users I do not follow yet', async () => {
      const me = await newUser();
      const star = await newUser();
      const followed = await newUser();
      // More followers than anyone else in the database.
      await prisma.user.update({
        where: { id: star.user.id },
        data: { followersCount: 2_000_000_000 },
      });
      await prisma.user.update({
        where: { id: followed.user.id },
        data: { followersCount: 1_999_999_990 },
      });
      await prisma.user.update({
        where: { id: me.user.id },
        data: { followersCount: 1_999_999_980 },
      });
      await follow(me, followed);

      const anonymous = await api().get('/feed/who-to-follow').expect(200);
      expect(anonymous.body.items).toHaveLength(3);
      expect(anonymous.body.items[0]).toEqual({
        id: star.user.id,
        name: star.user.name,
        handle: star.user.handle,
        avatar: null,
        verified: false,
        bio: '',
        isFollowing: false,
      });

      const forMe = await api(me)
        .get('/feed/who-to-follow?limit=20')
        .expect(200);
      const suggested = forMe.body.items.map((user: { id: string }) => user.id);
      expect(suggested[0]).toBe(star.user.id);
      expect(suggested).not.toContain(me.user.id);
      expect(suggested).not.toContain(followed.user.id);
    });
  });
});
