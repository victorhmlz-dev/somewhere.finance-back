import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { UserProfile } from '../src/users/user-profile.js';
import type { TestWallet } from './wallets.js';

export interface TestSession {
  accessToken: string;
  user: UserProfile;
}

/** Runs the whole wallet login and returns the resulting session. */
export async function signIn(
  app: INestApplication<App>,
  wallet: TestWallet,
): Promise<TestSession> {
  const challenge = await request(app.getHttpServer())
    .post('/auth/challenge')
    .send({ family: wallet.family, address: wallet.address })
    .expect(201);
  const signature = await wallet.sign(challenge.body.message);
  const session = await request(app.getHttpServer())
    .post('/auth/verify')
    .send({ nonce: challenge.body.nonce, signature })
    .expect(200);
  return session.body;
}
