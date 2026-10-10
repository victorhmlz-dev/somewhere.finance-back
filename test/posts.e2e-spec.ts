import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { PostView } from '../src/posts/post-view.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { signIn, type TestSession } from './session.js';
import { createEvmWallet } from './wallets.js';

// Needs the database from `npm run db:up`.
describe('Posts (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdAddresses: string[] = [];

  const newUser = async () => {
    const wallet = createEvmWallet();
    createdAddresses.push(wallet.address, wallet.address.toLowerCase());
    return signIn(app, wallet);
  };

  const api = (session?: TestSession) => {
    const send = (method: 'get' | 'post' | 'put' | 'delete', path: string) => {
      const req = request(app.getHttpServer())[method](path);
      return session
        ? req.set('Authorization', `Bearer ${session.accessToken}`)
        : req;
    };
    return {
      get: (path: string) => send('get', path),
      post: (path: string) => send('post', path),
      put: (path: string) => send('put', path),
      delete: (path: string) => send('delete', path),
    };
  };

  const publish = async (
    session: TestSession,
    body: { text?: string; image?: string; replyToId?: string },
  ): Promise<PostView> => {
    const response = await api(session).post('/posts').send(body).expect(201);
    return response.body;
  };

  const ids = (posts: PostView[]) => posts.map((post) => post.id);

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
    // Deleting a user takes their posts, likes and reposts with them.
    await prisma.user.deleteMany({
      where: { wallets: { some: { address: { in: createdAddresses } } } },
    });
    await prisma.authChallenge.deleteMany({
      where: { address: { in: createdAddresses } },
    });
    await app.close();
  });

  describe('publishing', () => {
    it('publishes a post and shows it to anyone', async () => {
      const aria = await newUser();

      const post = await publish(aria, {
        text: '  Neon Bazaar just crossed 75% minted. #NeonBazaar  ',
        image: 'https://example.com/bazaar.png',
      });
      expect(post).toEqual({
        id: expect.any(String),
        author: {
          id: aria.user.id,
          name: aria.user.name,
          handle: aria.user.handle,
          avatar: null,
          verified: false,
          bio: '',
        },
        text: 'Neon Bazaar just crossed 75% minted. #NeonBazaar',
        image: 'https://example.com/bazaar.png',
        createdAt: expect.any(String),
        replyTo: null,
        stats: { replies: 0, reposts: 0, likes: 0, views: 0 },
        isLiked: false,
        isReposted: false,
      });

      const seen = await api().get(`/posts/${post.id}`).expect(200);
      expect(seen.body).toEqual({
        ...post,
        stats: { ...post.stats, views: 1 },
      });
    });

    it('accepts a post that is only an image, or exactly 280 characters', async () => {
      const aria = await newUser();

      const imageOnly = await publish(aria, {
        image: 'https://example.com/piece.png',
      });
      expect(imageOnly.text).toBe('');

      const longest = await publish(aria, { text: 'a'.repeat(280) });
      expect(longest.text).toHaveLength(280);
    });

    it.each([
      ['an empty post', {}],
      ['a post of only spaces', { text: '   ' }],
      ['a text over 280 characters', { text: 'a'.repeat(281) }],
      ['an image that is not a URL', { text: 'hi', image: 'not a url' }],
      ['a reply to an invalid id', { text: 'hi', replyToId: 'nope' }],
      ['an unknown field', { text: 'hi', likesCount: 99 }],
    ])('rejects %s', async (_case, body) => {
      const aria = await newUser();
      await api(aria).post('/posts').send(body).expect(400);
    });

    it('requires a session to publish', async () => {
      await api().post('/posts').send({ text: 'hi' }).expect(401);
    });

    it('answers 404 for a post that does not exist and 400 for a bad id', async () => {
      await api().get(`/posts/${randomUUID()}`).expect(404);
      await api().get('/posts/not-an-id').expect(400);
    });
  });

  describe('replies', () => {
    it('hangs replies from a post, oldest first, and counts them', async () => {
      const aria = await newUser();
      const marcus = await newUser();
      const post = await publish(aria, { text: 'New piece is live.' });

      const first = await publish(marcus, {
        text: 'Bidding now.',
        replyToId: post.id,
      });
      const second = await publish(aria, {
        text: 'Thank you!',
        replyToId: post.id,
      });
      const nested = await publish(marcus, {
        text: 'Good luck.',
        replyToId: second.id,
      });
      expect(first.replyTo).toEqual({ id: post.id, handle: aria.user.handle });
      expect(nested.replyTo).toEqual({
        id: second.id,
        handle: aria.user.handle,
      });

      const parent = await api().get(`/posts/${post.id}`).expect(200);
      expect(parent.body.stats.replies).toBe(2);

      const firstPage = await api()
        .get(`/posts/${post.id}/replies?limit=1`)
        .expect(200);
      expect(ids(firstPage.body.items)).toEqual([first.id]);
      const secondPage = await api()
        .get(
          `/posts/${post.id}/replies?limit=1&cursor=${firstPage.body.nextCursor}`,
        )
        .expect(200);
      expect(ids(secondPage.body.items)).toEqual([second.id]);
      expect(secondPage.body.items[0].stats.replies).toBe(1);
      expect(secondPage.body.nextCursor).toBeNull();
    });

    it('answers 404 when replying to a post that does not exist', async () => {
      const aria = await newUser();
      await api(aria)
        .post('/posts')
        .send({ text: 'hi', replyToId: randomUUID() })
        .expect(404);
      await api().get(`/posts/${randomUUID()}/replies`).expect(404);
    });
  });

  describe.each(['like', 'repost'] as const)('%s', (reaction) => {
    const flag = reaction === 'like' ? 'isLiked' : 'isReposted';
    const counter = reaction === 'like' ? 'likes' : 'reposts';
    const other = reaction === 'like' ? 'reposts' : 'likes';

    it('adds and removes it, counting each user once', async () => {
      const aria = await newUser();
      const marcus = await newUser();
      const post = await publish(aria, { text: 'Hot take.' });
      const path = `/posts/${post.id}/${reaction}`;

      await Promise.all([
        api(marcus).put(path).expect(200),
        api(marcus).put(path).expect(200),
        api(marcus).put(path).expect(200),
      ]);
      const added = await api(aria).put(path).expect(200);
      expect(added.body).toMatchObject({ id: post.id, [flag]: true });
      expect(added.body.stats).toMatchObject({ [counter]: 2, [other]: 0 });

      // Each user sees their own flag; a stranger sees none.
      const seenByStranger = await api().get(`/posts/${post.id}`).expect(200);
      expect(seenByStranger.body[flag]).toBe(false);
      const seenByMarcus = await api(marcus)
        .get(`/posts/${post.id}`)
        .expect(200);
      expect(seenByMarcus.body[flag]).toBe(true);

      await api(marcus).delete(path).expect(200);
      const removed = await api(marcus).delete(path).expect(200);
      expect(removed.body).toMatchObject({ [flag]: false });
      expect(removed.body.stats[counter]).toBe(1);
    });

    it('requires a session and an existing post', async () => {
      const aria = await newUser();
      const post = await publish(aria, { text: 'hi' });

      await api().put(`/posts/${post.id}/${reaction}`).expect(401);
      await api().delete(`/posts/${post.id}/${reaction}`).expect(401);
      await api(aria).put(`/posts/${randomUUID()}/${reaction}`).expect(404);
    });
  });

  describe('deleting', () => {
    it('lets only the author delete a post', async () => {
      const aria = await newUser();
      const marcus = await newUser();
      const post = await publish(aria, { text: 'Mine.' });

      await api().delete(`/posts/${post.id}`).expect(401);
      await api(marcus).delete(`/posts/${post.id}`).expect(403);
      await api(aria).delete(`/posts/${post.id}`).expect(204);
      await api(aria).delete(`/posts/${post.id}`).expect(404);
    });

    it('hides a deleted post everywhere and erases its content', async () => {
      const aria = await newUser();
      const marcus = await newUser();
      const post = await publish(aria, {
        text: 'Regret this one.',
        image: 'https://example.com/regret.png',
      });
      const reply = await publish(marcus, {
        text: 'Too late.',
        replyToId: post.id,
      });

      await api(aria).delete(`/posts/${post.id}`).expect(204);

      await api().get(`/posts/${post.id}`).expect(404);
      await api().get(`/posts/${post.id}/replies`).expect(404);
      await api(marcus).put(`/posts/${post.id}/like`).expect(404);
      await api(marcus)
        .post('/posts')
        .send({ text: 'Hello?', replyToId: post.id })
        .expect(404);
      const authored = await api()
        .get(`/users/${aria.user.handle}/posts`)
        .expect(200);
      expect(authored.body.items).toEqual([]);

      const row = await prisma.post.findUniqueOrThrow({
        where: { id: post.id },
      });
      expect(row).toMatchObject({ text: '', imageUrl: null });

      // The reply survives and still says what it was replying to.
      const orphan = await api().get(`/posts/${reply.id}`).expect(200);
      expect(orphan.body.replyTo).toEqual({
        id: post.id,
        handle: aria.user.handle,
      });
    });

    it('takes a deleted reply out of the count of its parent', async () => {
      const aria = await newUser();
      const post = await publish(aria, { text: 'Thread.' });
      const reply = await publish(aria, { text: 'Oops.', replyToId: post.id });

      await api(aria).delete(`/posts/${reply.id}`).expect(204);

      const parent = await api().get(`/posts/${post.id}`).expect(200);
      expect(parent.body.stats.replies).toBe(0);
      const replies = await api().get(`/posts/${post.id}/replies`).expect(200);
      expect(replies.body.items).toEqual([]);
    });
  });
});
