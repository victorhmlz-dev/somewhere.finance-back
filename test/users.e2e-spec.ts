import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { signIn, type TestSession } from './session.js';
import { createEvmWallet, createSolanaWallet } from './wallets.js';

// Needs the database from `npm run db:up`.
describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdAddresses: string[] = [];

  const newUser = async (createWallet = createEvmWallet) => {
    const wallet = createWallet();
    createdAddresses.push(wallet.address, wallet.address.toLowerCase());
    return signIn(app, wallet);
  };

  const uniqueHandle = () => `t_${randomBytes(6).toString('hex')}`;

  const api = (session?: TestSession) => {
    const send = (method: 'get' | 'put' | 'patch' | 'delete', path: string) => {
      const req = request(app.getHttpServer())[method](path);
      return session
        ? req.set('Authorization', `Bearer ${session.accessToken}`)
        : req;
    };
    return {
      get: (path: string) => send('get', path),
      put: (path: string) => send('put', path),
      patch: (path: string) => send('patch', path),
      delete: (path: string) => send('delete', path),
    };
  };

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

  describe('profile', () => {
    it('shows a profile to anyone, by handle in any case', async () => {
      const { user } = await newUser();

      const response = await api()
        .get(`/users/${user.handle.toUpperCase()}`)
        .expect(200);
      expect(response.body).toEqual({
        ...user,
        followingCount: 0,
        followersCount: 0,
        isFollowing: false,
      });
    });

    it('answers 404 for a handle nobody has', async () => {
      await api().get(`/users/${uniqueHandle()}`).expect(404);
    });

    it('rejects a token that is present but invalid', async () => {
      const { user } = await newUser();
      await request(app.getHttpServer())
        .get(`/users/${user.handle}`)
        .set('Authorization', 'Bearer not-a-token')
        .expect(401);
    });

    it('edits only the fields that are sent', async () => {
      const session = await newUser();
      const handle = uniqueHandle();

      const edited = await api(session)
        .patch('/users/me')
        .send({
          name: '  Aria Chen  ',
          handle: handle.toUpperCase(),
          bio: 'Collector across four chains.',
          avatar: 'https://example.com/aria.png',
        })
        .expect(200);
      expect(edited.body).toMatchObject({
        id: session.user.id,
        name: 'Aria Chen',
        handle,
        bio: 'Collector across four chains.',
        avatar: 'https://example.com/aria.png',
      });

      const cleared = await api(session)
        .patch('/users/me')
        .send({ avatar: null })
        .expect(200);
      expect(cleared.body).toMatchObject({
        name: 'Aria Chen',
        handle,
        avatar: null,
      });

      await api().get(`/users/${handle}`).expect(200);
      await api().get(`/users/${session.user.handle}`).expect(404);
    });

    it('rejects a handle that another user already has', async () => {
      const first = await newUser();
      const second = await newUser();

      await api(second)
        .patch('/users/me')
        .send({ handle: first.user.handle.toUpperCase() })
        .expect(409);
    });

    it.each([
      ['a handle with invalid characters', { handle: 'aria chen' }],
      ['a handle that is too short', { handle: 'ab' }],
      ['a handle that is too long', { handle: 'a'.repeat(16) }],
      ['a blank name', { name: '   ' }],
      ['a null name', { name: null }],
      ['a name that is too long', { name: 'a'.repeat(51) }],
      ['a bio that is too long', { bio: 'a'.repeat(161) }],
      ['an avatar that is not a URL', { avatar: 'javascript:alert(1)' }],
      ['an unknown field', { verified: true }],
    ])('rejects %s', async (_case, body) => {
      const session = await newUser();
      await api(session).patch('/users/me').send(body).expect(400);
    });

    it('requires a session to edit', async () => {
      await api().patch('/users/me').send({ name: 'Nobody' }).expect(401);
    });
  });

  describe('follows', () => {
    it('follows and unfollows, keeping both counters in step', async () => {
      const aria = await newUser();
      const marcus = await newUser(createSolanaWallet);

      const followed = await api(aria)
        .put(`/users/${marcus.user.handle}/follow`)
        .expect(200);
      expect(followed.body).toMatchObject({
        id: marcus.user.id,
        followersCount: 1,
        followingCount: 0,
        isFollowing: true,
      });

      const me = await api(aria).get('/auth/me').expect(200);
      expect(me.body).toMatchObject({ followingCount: 1, followersCount: 0 });

      // Marcus does not follow Aria back, and a stranger follows nobody.
      const seenByMarcus = await api(marcus)
        .get(`/users/${aria.user.handle}`)
        .expect(200);
      expect(seenByMarcus.body.isFollowing).toBe(false);
      const seenByStranger = await api()
        .get(`/users/${marcus.user.handle}`)
        .expect(200);
      expect(seenByStranger.body).toMatchObject({
        followersCount: 1,
        isFollowing: false,
      });

      const unfollowed = await api(aria)
        .delete(`/users/${marcus.user.handle}/follow`)
        .expect(200);
      expect(unfollowed.body).toMatchObject({
        followersCount: 0,
        isFollowing: false,
      });
      const meAfter = await api(aria).get('/auth/me').expect(200);
      expect(meAfter.body.followingCount).toBe(0);
    });

    it('counts a repeated follow or unfollow only once', async () => {
      const aria = await newUser();
      const marcus = await newUser();
      const path = `/users/${marcus.user.handle}/follow`;

      await Promise.all([
        api(aria).put(path).expect(200),
        api(aria).put(path).expect(200),
        api(aria).put(path).expect(200),
      ]);
      const followed = await api(aria).put(path).expect(200);
      expect(followed.body.followersCount).toBe(1);

      await api(aria).delete(path).expect(200);
      const unfollowed = await api(aria).delete(path).expect(200);
      expect(unfollowed.body.followersCount).toBe(0);

      const me = await api(aria).get('/auth/me').expect(200);
      expect(me.body.followingCount).toBe(0);
    });

    it('does not let a user follow themselves', async () => {
      const aria = await newUser();
      await api(aria).put(`/users/${aria.user.handle}/follow`).expect(400);
    });

    it('answers 404 when the user to follow does not exist', async () => {
      const aria = await newUser();
      await api(aria).put(`/users/${uniqueHandle()}/follow`).expect(404);
    });

    it('requires a session to follow or unfollow', async () => {
      const { user } = await newUser();
      await api().put(`/users/${user.handle}/follow`).expect(401);
      await api().delete(`/users/${user.handle}/follow`).expect(401);
    });

    it('lists followers and following page by page, newest first', async () => {
      const star = await newUser();
      const fans = [await newUser(), await newUser(), await newUser()];
      for (const fan of fans) {
        await api(fan).put(`/users/${star.user.handle}/follow`).expect(200);
      }
      const [oldest, middle, newest] = fans;
      // The newest fan also follows the oldest one.
      await api(newest).put(`/users/${oldest.user.handle}/follow`).expect(200);

      const firstPage = await api(newest)
        .get(`/users/${star.user.handle}/followers?limit=2`)
        .expect(200);
      expect(
        firstPage.body.items.map((item: { id: string }) => item.id),
      ).toEqual([newest.user.id, middle.user.id]);
      expect(firstPage.body.items[0]).toEqual({
        id: newest.user.id,
        name: newest.user.name,
        handle: newest.user.handle,
        avatar: null,
        verified: false,
        bio: '',
        isFollowing: false,
      });
      expect(firstPage.body.nextCursor).toEqual(expect.any(String));

      const secondPage = await api(newest)
        .get(
          `/users/${star.user.handle}/followers?limit=2&cursor=${firstPage.body.nextCursor}`,
        )
        .expect(200);
      expect(secondPage.body).toMatchObject({
        items: [{ id: oldest.user.id, isFollowing: true }],
        nextCursor: null,
      });

      const following = await api()
        .get(`/users/${newest.user.handle}/following`)
        .expect(200);
      expect(following.body).toMatchObject({
        items: [
          { id: oldest.user.id, isFollowing: false },
          { id: star.user.id, isFollowing: false },
        ],
        nextCursor: null,
      });
    });

    it('rejects an invalid page size or cursor', async () => {
      const { user } = await newUser();
      await api().get(`/users/${user.handle}/followers?limit=0`).expect(400);
      await api().get(`/users/${user.handle}/followers?limit=51`).expect(400);
      await api()
        .get(`/users/${user.handle}/followers?cursor=not-a-cursor`)
        .expect(400);
    });
  });
});
