import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { UserProfile } from '../src/users/user-profile.js';
import type { TestWallet } from './wallets.js';

export interface TestSession {
  accessToken: string;
  user: UserProfile;
}

/** Requests to the API, sent as `session` or anonymously without one. */
export function apiClient(app: INestApplication<App>, session?: TestSession) {
  const send = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ) => {
    const req = request(app.getHttpServer())[method](path);
    return session
      ? req.set('Authorization', `Bearer ${session.accessToken}`)
      : req;
  };
  return {
    get: (path: string) => send('get', path),
    post: (path: string) => send('post', path),
    put: (path: string) => send('put', path),
    patch: (path: string) => send('patch', path),
    delete: (path: string) => send('delete', path),
  };
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
