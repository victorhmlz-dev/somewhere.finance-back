import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PRIVY_KEYS } from '../src/auth/privy-identity.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { signIn } from './session.js';
import { createEvmWallet, createSolanaWallet } from './wallets.js';

const APP_ID = 'test-privy-app';

// Needs the database from `npm run db:up`. Privy is replaced by a key made
// here: the tokens are signed exactly as Privy signs them (ES256, issuer
// privy.io, audience the app), with this key instead of Privy's.
describe('Sign-in with Privy (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let privyKey: CryptoKey;
  let strangerKey: CryptoKey;
  const subjects: string[] = [];
  const createdAddresses: string[] = [];
  const previousAppId = process.env.PRIVY_APP_ID;

  const newSubject = () => {
    const subject = `did:privy:test${randomBytes(8).toString('hex')}`;
    subjects.push(subject);
    return subject;
  };
  const evm = () => {
    const wallet = createEvmWallet();
    createdAddresses.push(wallet.address.toLowerCase());
    return wallet;
  };

  /** An identity token as Privy issues it, with those linked wallets. */
  function identityToken(
    subject: string,
    wallets: { address: string; chain_type: string }[],
    changes: {
      audience?: string;
      issuer?: string;
      key?: CryptoKey;
      expiresIn?: string;
    } = {},
  ) {
    return new SignJWT({
      linked_accounts: JSON.stringify([
        { type: 'email', address: 'someone@example.com' },
        ...wallets.map((wallet) => ({ type: 'wallet', ...wallet })),
      ]),
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setIssuer(changes.issuer ?? 'privy.io')
      .setAudience(changes.audience ?? APP_ID)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime(changes.expiresIn ?? '1h')
      .sign(changes.key ?? privyKey);
  }

  const signInWith = (token: string) =>
    request(app.getHttpServer())
      .post('/auth/privy')
      .send({ identityToken: token });

  const walletsOf = (userId: string) =>
    prisma.wallet.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    process.env.PRIVY_APP_ID = APP_ID;
    const keys = await generateKeyPair('ES256');
    privyKey = keys.privateKey;
    strangerKey = (await generateKeyPair('ES256')).privateKey;
    const jwks = createLocalJWKSet({
      keys: [
        { ...(await exportJWK(keys.publicKey)), kid: 'test', alg: 'ES256' },
      ],
    });

    // The app reads its configuration when it is first imported
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PRIVY_KEYS)
      .useValue(jwks)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { identities: { some: { subject: { in: subjects } } } },
          { wallets: { some: { address: { in: createdAddresses } } } },
        ],
      },
    });
    await prisma.authChallenge.deleteMany({
      where: { address: { in: createdAddresses } },
    });
    await app.close();
    if (previousAppId === undefined) delete process.env.PRIVY_APP_ID;
    else process.env.PRIVY_APP_ID = previousAppId;
  });

  it('creates an account for a new user, with every wallet Privy linked', async () => {
    const subject = newSubject();
    const embedded = evm();
    const phantom = createSolanaWallet();
    createdAddresses.push(phantom.address);

    const response = await signInWith(
      await identityToken(subject, [
        { address: phantom.address, chain_type: 'solana' },
        { address: embedded.address, chain_type: 'ethereum' },
      ]),
    ).expect(200);

    expect(response.body.accessToken).toEqual(expect.any(String));
    // The EVM wallet is the main one: launches live on EVM chains for now
    expect(response.body.user.walletAddress).toBe(
      embedded.address.toLowerCase(),
    );
    const wallets = await walletsOf(response.body.user.id);
    expect(wallets.map((wallet) => [wallet.family, wallet.isPrimary])).toEqual([
      ['evm', true],
      ['solana', false],
    ]);

    // The token opens the same session again, with no message to sign
    const again = await signInWith(
      await identityToken(subject, [
        { address: embedded.address, chain_type: 'ethereum' },
      ]),
    ).expect(200);
    expect(again.body.user.id).toBe(response.body.user.id);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${again.body.accessToken}`)
      .expect(200);
    expect(me.body.id).toBe(response.body.user.id);
    // Their own wallets, the main one first; only they see the list
    expect(me.body.wallets).toEqual([
      {
        family: 'evm',
        address: embedded.address.toLowerCase(),
        isPrimary: true,
      },
      { family: 'solana', address: phantom.address, isPrimary: false },
    ]);
    const profile = await request(app.getHttpServer())
      .get(`/users/${me.body.handle}`)
      .expect(200);
    expect(profile.body.wallets).toBeUndefined();
  });

  it('keeps the account of someone who signed in with that wallet before', async () => {
    const metamask = evm();
    const before = await signIn(app, metamask);
    const embedded = evm();

    const response = await signInWith(
      await identityToken(newSubject(), [
        { address: embedded.address, chain_type: 'ethereum' },
        { address: metamask.address, chain_type: 'ethereum' },
      ]),
    ).expect(200);

    expect(response.body.user.id).toBe(before.user.id);
    // Still the wallet it had; the new one joins it
    expect(response.body.user.walletAddress).toBe(
      metamask.address.toLowerCase(),
    );
    const wallets = await walletsOf(before.user.id);
    expect(wallets.map((wallet) => wallet.address)).toEqual([
      metamask.address.toLowerCase(),
      embedded.address.toLowerCase(),
    ]);
  });

  it('never moves a wallet that belongs to another account', async () => {
    const theirs = evm();
    const other = await signIn(app, theirs);
    const mine = evm();
    const subject = newSubject();
    const first = await signInWith(
      await identityToken(subject, [
        { address: mine.address, chain_type: 'ethereum' },
      ]),
    ).expect(200);

    // Later the Privy user links a wallet another account already has
    await signInWith(
      await identityToken(subject, [
        { address: mine.address, chain_type: 'ethereum' },
        { address: theirs.address, chain_type: 'ethereum' },
      ]),
    ).expect(200);

    expect((await walletsOf(first.body.user.id)).map((w) => w.address)).toEqual(
      [mine.address.toLowerCase()],
    );
    expect((await walletsOf(other.user.id)).map((w) => w.address)).toEqual([
      theirs.address.toLowerCase(),
    ]);
  });

  it('asks to wait while the wallet of a new email user is being created', async () => {
    await signInWith(await identityToken(newSubject(), [])).expect(409);
  });

  it('refuses any token Privy did not issue for this app, or that expired', async () => {
    const wallet = { address: evm().address, chain_type: 'ethereum' };
    for (const changes of [
      { audience: 'another-app' },
      { issuer: 'evil.example' },
      { key: strangerKey },
      { expiresIn: '-1m' },
    ]) {
      await signInWith(
        await identityToken(newSubject(), [wallet], changes),
      ).expect(401);
    }
    await signInWith('not.a.token.at.all.just.some.text').expect(401);
    await request(app.getHttpServer()).post('/auth/privy').send({}).expect(400);
  });
});
