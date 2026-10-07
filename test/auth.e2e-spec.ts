import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createEvmWallet,
  createSolanaWallet,
  type TestWallet,
} from './wallets.js';

// Needs the database from `npm run db:up`.
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdAddresses: string[] = [];

  const requestChallenge = (wallet: TestWallet) =>
    request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ family: wallet.family, address: wallet.address });

  const verify = (nonce: string, signature: string) =>
    request(app.getHttpServer())
      .post('/auth/verify')
      .send({ nonce, signature });

  const login = async (wallet: TestWallet) => {
    const challenge = await requestChallenge(wallet).expect(201);
    const signature = await wallet.sign(challenge.body.message);
    return verify(challenge.body.nonce, signature);
  };

  const newWallet = (create: () => TestWallet) => {
    const wallet = create();
    createdAddresses.push(wallet.address, wallet.address.toLowerCase());
    return wallet;
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

  describe.each([
    ['evm', createEvmWallet],
    ['solana', createSolanaWallet],
  ] as const)('%s wallet', (family, createWallet) => {
    it('signs a new wallet up and returns a working access token', async () => {
      const wallet = newWallet(createWallet);

      const response = await login(wallet);
      expect(response.status).toBe(200);
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user).toMatchObject({
        handle: expect.stringMatching(/^user_[a-z0-9]+$/),
        verified: false,
        bio: '',
      });
      expect(response.body.user.walletAddress.toLowerCase()).toBe(
        wallet.address.toLowerCase(),
      );

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);
      expect(me.body).toEqual(response.body.user);

      const wallets = await prisma.wallet.findMany({
        where: { userId: response.body.user.id },
      });
      expect(wallets).toHaveLength(1);
      expect(wallets[0]).toMatchObject({ family, isPrimary: true });
    });

    it('logs the same wallet into the same user the second time', async () => {
      const wallet = newWallet(createWallet);

      const first = await login(wallet);
      const second = await login(wallet);

      expect(second.status).toBe(200);
      expect(second.body.user.id).toBe(first.body.user.id);
    });

    it('rejects a challenge signed by a different wallet', async () => {
      const wallet = newWallet(createWallet);
      const challenge = await requestChallenge(wallet).expect(201);
      const signature = await createWallet().sign(challenge.body.message);

      await verify(challenge.body.nonce, signature).expect(401);
    });

    it('rejects a signature that has already been used', async () => {
      const wallet = newWallet(createWallet);
      const challenge = await requestChallenge(wallet).expect(201);
      const signature = await wallet.sign(challenge.body.message);

      await verify(challenge.body.nonce, signature).expect(200);
      await verify(challenge.body.nonce, signature).expect(401);
    });

    it('rejects an expired challenge', async () => {
      const wallet = newWallet(createWallet);
      const challenge = await requestChallenge(wallet).expect(201);
      const signature = await wallet.sign(challenge.body.message);
      await prisma.authChallenge.update({
        where: { nonce: challenge.body.nonce },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await verify(challenge.body.nonce, signature).expect(401);
    });
  });

  it('treats EVM addresses as case-insensitive', async () => {
    const wallet = newWallet(createEvmWallet);
    const first = await login(wallet);
    const second = await login({
      ...wallet,
      address: wallet.address.toLowerCase(),
    });

    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('rejects an invalid address', async () => {
    await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ family: 'evm', address: '0x1234' })
      .expect(400);
  });

  it('rejects an unknown family and unknown fields', async () => {
    const { address } = createEvmWallet();
    await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ family: 'bitcoin', address })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ family: 'evm', address, isAdmin: true })
      .expect(400);
  });

  it('rejects an unknown nonce', async () => {
    await verify('0000000000000000', '0x' + '00'.repeat(65)).expect(401);
  });

  it('rejects /auth/me without a valid token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
  });
});
