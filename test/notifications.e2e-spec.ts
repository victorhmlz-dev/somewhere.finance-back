import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { NotificationView } from '../src/notifications/notifications.service.js';
import type { PostView } from '../src/posts/post-view.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { apiClient, signIn, type TestSession } from './session.js';
import { createEvmWallet } from './wallets.js';

// Needs the database from `npm run db:up`.
describe('Notifications (e2e)', () => {
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

  const react = (
    session: TestSession,
    post: PostView,
    reaction: 'like' | 'repost',
  ) => api(session).put(`/posts/${post.id}/${reaction}`).expect(200);

  const follow = (session: TestSession, target: TestSession) =>
    api(session).put(`/users/${target.user.handle}/follow`).expect(200);

  const listFor = async (
    session: TestSession,
    query = '',
  ): Promise<{ items: NotificationView[]; nextCursor: string | null }> => {
    const response = await api(session)
      .get(`/notifications${query}`)
      .expect(200);
    return response.body;
  };

  const unreadFor = async (session: TestSession): Promise<number> => {
    const response = await api(session)
      .get('/notifications/unread-count')
      .expect(200);
    return response.body.count;
  };

  /** What a list shows, as `[type, handles of the actors, others]`. */
  const summary = (items: NotificationView[]) =>
    items.map((item) => [
      item.type,
      item.actors.map((actor) => actor.handle),
      item.otherActorCount,
    ]);

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

  it('notifies likes, reposts, follows, mentions and replies, newest first', async () => {
    const aria = await newUser();
    const marcus = await newUser();
    const yuki = await newUser();
    const post = await publish(aria, 'Just listed three new pieces.');

    await react(marcus, post, 'like');
    await react(marcus, post, 'repost');
    await follow(yuki, aria);
    const mention = await publish(
      marcus,
      `Best call of the week, thanks @${aria.user.handle.toUpperCase()}!`,
    );
    const reply = await publish(yuki, 'Congrats!', post.id);

    const { items, nextCursor } = await listFor(aria);
    expect(summary(items)).toEqual([
      ['reply', [yuki.user.handle], 0],
      ['mention', [marcus.user.handle], 0],
      ['follow', [yuki.user.handle], 0],
      ['repost', [marcus.user.handle], 0],
      ['like', [marcus.user.handle], 0],
    ]);
    expect(nextCursor).toBeNull();

    expect(items[0].post).toMatchObject({
      id: reply.id,
      text: 'Congrats!',
      replyTo: { id: post.id, handle: aria.user.handle },
    });
    expect(items[1].post?.id).toBe(mention.id);
    expect(items[2].post).toBeNull();
    expect(items[4]).toEqual({
      id: expect.any(String),
      type: 'like',
      actors: [
        {
          id: marcus.user.id,
          name: marcus.user.name,
          handle: marcus.user.handle,
          avatar: null,
          verified: false,
          bio: '',
        },
      ],
      otherActorCount: 0,
      actorAddress: null,
      post: expect.objectContaining({
        id: post.id,
        text: 'Just listed three new pieces.',
        // Reading notifications does not count as viewing the post.
        stats: { replies: 1, reposts: 1, likes: 1, views: 0 },
      }),
      launch: null,
      reaction: null,
      purchase: null,
      createdAt: expect.any(String),
      isUnread: true,
    });

    // Nobody else was told anything.
    expect((await listFor(marcus)).items).toEqual([]);
  });

  it('groups who liked the same post, showing the three most recent', async () => {
    const aria = await newUser();
    const fans = [
      await newUser(),
      await newUser(),
      await newUser(),
      await newUser(),
    ];
    const post = await publish(aria, 'Floor is moving.');
    const other = await publish(aria, 'Another one.');
    for (const fan of fans) await react(fan, post, 'like');
    await react(fans[0], other, 'like');
    await follow(fans[0], aria);
    await follow(fans[1], aria);

    const { items } = await listFor(aria);
    const [first, second, third, fourth] = fans.map((fan) => fan.user.handle);
    expect(summary(items)).toEqual([
      ['follow', [second, first], 0],
      ['like', [first], 0],
      ['like', [fourth, third, second], 1],
    ]);
    expect(items[1].post?.id).toBe(other.id);
    expect(items[2].post?.id).toBe(post.id);
    expect(await unreadFor(aria)).toBe(3);
  });

  it('marks everything as read, and new activity as unread again', async () => {
    const aria = await newUser();
    const marcus = await newUser();
    const yuki = await newUser();
    const post = await publish(aria, 'Hot take.');
    await react(marcus, post, 'like');
    await follow(marcus, aria);
    expect(await unreadFor(aria)).toBe(2);

    await api(aria).post('/notifications/read').expect(204);
    expect(await unreadFor(aria)).toBe(0);
    expect((await listFor(aria)).items.map((item) => item.isUnread)).toEqual([
      false,
      false,
    ]);

    // A new like joins the group of the same post and makes it unread.
    await react(yuki, post, 'like');
    expect(await unreadFor(aria)).toBe(1);
    const { items } = await listFor(aria);
    expect(summary(items)).toEqual([
      ['like', [yuki.user.handle, marcus.user.handle], 0],
      ['follow', [marcus.user.handle], 0],
    ]);
    expect(items.map((item) => item.isUnread)).toEqual([true, false]);
  });

  it('takes back a notification when its cause is undone or deleted', async () => {
    const aria = await newUser();
    const marcus = await newUser();
    const post = await publish(aria, 'Mine.');
    const doomed = await publish(aria, 'Deleted soon.');

    await react(marcus, post, 'like');
    await react(marcus, post, 'repost');
    await follow(marcus, aria);
    await react(marcus, doomed, 'like');
    const reply = await publish(marcus, 'Replying.', post.id);
    const mention = await publish(marcus, `Hey @${aria.user.handle}`);
    expect((await listFor(aria)).items).toHaveLength(6);

    await api(marcus).delete(`/posts/${post.id}/like`).expect(200);
    await api(marcus).delete(`/posts/${post.id}/repost`).expect(200);
    await api(marcus).delete(`/users/${aria.user.handle}/follow`).expect(200);
    await api(aria).delete(`/posts/${doomed.id}`).expect(204);
    await api(marcus).delete(`/posts/${reply.id}`).expect(204);
    await api(marcus).delete(`/posts/${mention.id}`).expect(204);

    expect((await listFor(aria)).items).toEqual([]);
    expect(await unreadFor(aria)).toBe(0);
  });

  it('does not notify what users do to themselves, or repeat itself', async () => {
    const aria = await newUser();
    const marcus = await newUser();
    const post = await publish(aria, `Talking to myself, @${aria.user.handle}`);
    await react(aria, post, 'like');
    await react(aria, post, 'repost');
    await publish(aria, 'Replying to myself.', post.id);
    expect((await listFor(aria)).items).toEqual([]);

    // A reply that also mentions the author is one notification, not two;
    // so is a handle mentioned twice, or a like sent twice.
    await publish(marcus, `@${aria.user.handle} agreed`, post.id);
    await publish(
      marcus,
      `@${aria.user.handle} @${aria.user.handle} @nobody_here`,
    );
    await react(marcus, post, 'like');
    await react(marcus, post, 'like');

    expect(summary((await listFor(aria)).items)).toEqual([
      ['like', [marcus.user.handle], 0],
      ['mention', [marcus.user.handle], 0],
      ['reply', [marcus.user.handle], 0],
    ]);
  });

  it('filters by tab: verified users, or mentions and replies', async () => {
    const aria = await newUser();
    const verified = await newUser();
    const plain = await newUser();
    await prisma.user.update({
      where: { id: verified.user.id },
      data: { verified: true },
    });
    const post = await publish(aria, 'Tabs.');
    await react(verified, post, 'like');
    await react(plain, post, 'like');
    await follow(plain, aria);
    await publish(plain, `@${aria.user.handle} hello`);
    await publish(verified, 'A reply.', post.id);

    expect(summary((await listFor(aria, '?tab=all')).items)).toEqual([
      ['reply', [verified.user.handle], 0],
      ['mention', [plain.user.handle], 0],
      ['follow', [plain.user.handle], 0],
      ['like', [plain.user.handle, verified.user.handle], 0],
    ]);
    expect(summary((await listFor(aria, '?tab=verified')).items)).toEqual([
      ['reply', [verified.user.handle], 0],
      ['like', [verified.user.handle], 0],
    ]);
    expect(summary((await listFor(aria, '?tab=mentions')).items)).toEqual([
      ['reply', [verified.user.handle], 0],
      ['mention', [plain.user.handle], 0],
    ]);
    await api(aria).get('/notifications?tab=everything').expect(400);
  });

  it('pages through the list without repeating or skipping', async () => {
    const aria = await newUser();
    const marcus = await newUser();
    const first = await publish(aria, 'One.');
    const second = await publish(aria, 'Two.');
    await react(marcus, first, 'like');
    await react(marcus, second, 'like');
    await follow(marcus, aria);

    const firstPage = await listFor(aria, '?limit=2');
    expect(summary(firstPage.items).map(([type]) => type)).toEqual([
      'follow',
      'like',
    ]);
    expect(firstPage.items[1].post?.id).toBe(second.id);

    const secondPage = await listFor(
      aria,
      `?limit=2&cursor=${firstPage.nextCursor}`,
    );
    expect(secondPage.items.map((item) => item.post?.id)).toEqual([first.id]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('requires a session', async () => {
    await api().get('/notifications').expect(401);
    await api().get('/notifications/unread-count').expect(401);
    await api().post('/notifications/read').expect(401);
  });
});
