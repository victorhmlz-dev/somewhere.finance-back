import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RATE_LIMITS } from '../src/common/rate-limits.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { apiClient, signIn, type TestSession } from './session.js';
import { pngOf } from './support/images.js';
import { createEvmWallet } from './wallets.js';

// Limits are off in the other test files; here they are on.
describe('Request limits (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let session: TestSession;
  const createdAddresses: string[] = [];
  const previousEnv = {
    RATE_LIMIT_ENABLED: process.env.RATE_LIMIT_ENABLED,
    UPLOAD_DAILY_LIMIT: process.env.UPLOAD_DAILY_LIMIT,
  };

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.UPLOAD_DAILY_LIMIT = '3';
    // The app reads its configuration when it is first imported
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Signed in before any test: the sign-in routes are limited too
    const wallet = createEvmWallet();
    createdAddresses.push(wallet.address, wallet.address.toLowerCase());
    session = await signIn(app, wallet);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { wallets: { some: { address: { in: createdAddresses } } } },
    });
    await prisma.authChallenge.deleteMany({
      where: { address: { in: createdAddresses } },
    });
    await app.close();
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('limits how many images a user uploads in a day', async () => {
    const upload = async (colour: string) =>
      apiClient(app, session)
        .post('/uploads/images')
        .attach('file', await pngOf(colour), {
          filename: 'image.png',
          contentType: 'image/png',
        });

    for (const colour of ['#110000', '#001100', '#000011']) {
      expect((await upload(colour)).status).toBe(201);
    }
    const refused = await upload('#111111');
    expect(refused.status).toBe(429);
    expect(refused.body.message).toMatch(/3 images a day/);
    expect(
      await prisma.upload.count({ where: { userId: session.user.id } }),
    ).toBe(3);
  });

  it('stops giving sign-in challenges after the limit per minute', async () => {
    const ask = () =>
      request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ family: 'evm', address: createEvmWallet().address });

    // The sign-in in beforeAll already asked for one
    for (let i = 1; i < RATE_LIMITS.signIn; i += 1) await ask().expect(201);
    const refused = await ask().expect(429);
    expect(refused.body.message).toMatch(/Too many requests/);

    // Each route keeps its own count
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
