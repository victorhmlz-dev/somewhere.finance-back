import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import type { App } from 'supertest/types.js';
import { apiClient, type TestSession } from '../session.js';

/** A small PNG of one colour: each colour is a different file. */
export const pngOf = (colour: string) =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: colour } })
    .png()
    .toBuffer();

/**
 * Uploads an image as `session` and returns its link: avatars, posts and
 * launches only take images uploaded to the API.
 */
export async function uploadTestImage(
  app: INestApplication<App>,
  session: TestSession,
  colour = '#5142fc',
): Promise<string> {
  const response = await apiClient(app, session)
    .post('/uploads/images')
    .attach('file', await pngOf(colour), {
      filename: 'image.png',
      contentType: 'image/png',
    })
    .expect(201);
  return response.body.url;
}
