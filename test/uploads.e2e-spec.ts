import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { apiClient, signIn, type TestSession } from './session.js';
import { createEvmWallet } from './wallets.js';

// The smallest valid PNG: one transparent pixel
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

// Needs the database from `npm run db:up`. Files go to a temporary folder.
describe('Uploads (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let uploadDir: string;
  let session: TestSession;
  const createdAddresses: string[] = [];
  const previousEnv = {
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    PUBLIC_API_URL: process.env.PUBLIC_API_URL,
  };

  const api = (as?: TestSession) => apiClient(app, as);
  const pathOf = (url: string) => url.replace('https://api.test', '');
  const upload = (file: Buffer, filename: string, contentType: string) =>
    api(session)
      .post('/uploads/images')
      .attach('file', file, { filename, contentType });
  const download = async (url: string) =>
    Buffer.from((await api().get(pathOf(url)).expect(200)).body);

  beforeAll(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'somewhere-uploads-'));
    process.env.UPLOAD_DIR = uploadDir;
    process.env.PUBLIC_API_URL = 'https://api.test';
    // The app reads its configuration when it is first imported
    const { AppModule } = await import('../src/app.module.js');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

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
    await rm(uploadDir, { recursive: true, force: true });
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('stores an image and serves it from the link it returns', async () => {
    const stored = await upload(PNG, 'logo.png', 'image/png').expect(201);
    expect(stored.body.url).toMatch(
      /^https:\/\/api\.test\/uploads\/[0-9a-f]{64}\.png$/,
    );

    const served = await api()
      .get(pathOf(stored.body.url))
      .expect(200)
      .expect('Content-Type', 'image/png')
      .expect('X-Content-Type-Options', 'nosniff');
    expect(served.headers['cache-control']).toContain('immutable');

    // Named by the hash of what is served, so anyone can check it
    const bytes = Buffer.from(served.body);
    expect(stored.body.url).toContain(sha256(bytes));
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: 'png',
      width: 1,
      height: 1,
    });
  });

  it('keeps the same image once, under the same link', async () => {
    const first = await upload(PNG, 'a.png', 'image/png').expect(201);
    const second = await upload(PNG, 'b.png', 'image/png').expect(201);
    expect(second.body.url).toBe(first.body.url);
  });

  it('names the file by what it contains, not by what the browser says', async () => {
    const stored = await upload(PNG, 'logo.gif', 'image/gif').expect(201);
    expect(stored.body.url).toMatch(/\.png$/);
  });

  it('keeps only the picture: no hidden data, nothing appended', async () => {
    const photo = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#5142fc' },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-location-42' } })
      .toBuffer();
    const smuggled = Buffer.concat([photo, Buffer.from('<script>x</script>')]);
    expect(smuggled.includes('secret-location-42')).toBe(true);

    const stored = await upload(smuggled, 'photo.jpg', 'image/jpeg').expect(
      201,
    );
    expect(stored.body.url).toMatch(/\.jpg$/);

    const served = await download(stored.body.url);
    expect(served.includes('secret-location-42')).toBe(false);
    expect(served.includes('<script>')).toBe(false);
    expect((await sharp(served).metadata()).exif).toBeUndefined();
  });

  it('scales a huge image down', async () => {
    const wide = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    const stored = await upload(wide, 'wide.png', 'image/png').expect(201);
    expect(
      await sharp(await download(stored.body.url)).metadata(),
    ).toMatchObject({ width: 2048, height: 683 });
  });

  it('rejects what is not an image', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    await upload(svg, 'logo.png', 'image/png').expect(400);
  });

  it('rejects a file that only starts like an image', async () => {
    const fake = Buffer.concat([PNG.subarray(0, 16), Buffer.alloc(64, 7)]);
    await upload(fake, 'logo.png', 'image/png').expect(400);
  });

  it('rejects an image over 2 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    await upload(big, 'big.png', 'image/png').expect(413);
  });

  it('asks for the file', async () => {
    await api(session).post('/uploads/images').expect(400);
  });

  it('only takes uploads from signed-in users', async () => {
    await api()
      .post('/uploads/images')
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(401);
  });

  it('serves only the files it stored', async () => {
    const before = await readdir(uploadDir);
    await api()
      .get(`/uploads/${'0'.repeat(64)}.png`)
      .expect(404);
    await api()
      .get('/uploads/00000000-0000-0000-0000-000000000000.png')
      .expect(404);
    await api().get('/uploads/..%2F..%2Fpackage.json').expect(404);
    await api().get('/uploads/notes.txt').expect(404);
    expect(await readdir(uploadDir)).toEqual(before);
  });
});
