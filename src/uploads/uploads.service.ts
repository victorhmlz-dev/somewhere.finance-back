import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp, { type Sharp } from 'sharp';
import type { Env } from '../config/env.js';
import { detectImage, type ImageExtension } from './image-file.js';

/** Names the API gives to stored files: the SHA-256 of the file and its extension. */
export const STORED_NAME_PATTERN = /^[0-9a-f]{64}\.(png|jpg|gif|webp)$/;

/** Longest side an image is kept at. Larger ones are scaled down. */
const MAX_SIDE = 2048;
/** Images larger than this, in pixels, are refused before being decoded. */
const MAX_INPUT_PIXELS = 40_000_000;

/** Writes the image again in its own format, from the decoded pixels. */
const ENCODERS: Record<ImageExtension, (image: Sharp) => Sharp> = {
  png: (image) => image.png({ compressionLevel: 9 }),
  jpg: (image) => image.jpeg({ quality: 90, mozjpeg: true }),
  gif: (image) => image.gif(),
  webp: (image) => image.webp({ quality: 90 }),
};

/**
 * Images people upload, kept in a folder of the server.
 *
 * Every image is decoded and written again before it is stored. Only the
 * picture survives: hidden metadata (such as the GPS position of a photo)
 * and anything appended to the file are dropped. The file is then named by
 * the SHA-256 of what is stored, so a link always shows the same picture,
 * anyone can check it, and the same image uploaded twice is kept once.
 */
@Injectable()
export class UploadsService {
  readonly directory: string;
  private readonly publicApiUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.directory = resolve(config.get('UPLOAD_DIR', { infer: true }));
    this.publicApiUrl = config.get('PUBLIC_API_URL', { infer: true });
  }

  /** Stores an image and returns the link it is served from. */
  async saveImage(bytes: Buffer): Promise<{ url: string }> {
    const extension = detectImage(bytes);
    if (!extension) {
      throw new BadRequestException(
        'The file must be a PNG, JPEG, GIF or WebP image',
      );
    }

    const clean = await this.rewrite(bytes, extension);
    const name = `${createHash('sha256').update(clean).digest('hex')}.${extension}`;
    await mkdir(this.directory, { recursive: true });
    try {
      await writeFile(resolve(this.directory, name), clean, { flag: 'wx' });
    } catch (error) {
      // Already stored: same content, same name
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return { url: this.urlOf(name) };
  }

  /**
   * The stored file a link points to, if the link is one this API gave and
   * the file is still there. Null for anything else.
   */
  async storedNameOf(url: string): Promise<string | null> {
    const prefix = `${this.publicApiUrl}/uploads/`;
    if (!url.startsWith(prefix)) return null;
    const name = url.slice(prefix.length);
    return (await this.exists(name)) ? name : null;
  }

  /** Checks that a stored file exists, before it is sent. */
  async assertExists(name: string): Promise<void> {
    if (!(await this.exists(name))) {
      throw new NotFoundException('File not found');
    }
  }

  private urlOf(name: string): string {
    return `${this.publicApiUrl}/uploads/${name}`;
  }

  private async exists(name: string): Promise<boolean> {
    if (!STORED_NAME_PATTERN.test(name)) return false;
    return stat(resolve(this.directory, name)).then(
      (file) => file.isFile(),
      () => false,
    );
  }

  private async rewrite(
    bytes: Buffer,
    extension: ImageExtension,
  ): Promise<Buffer> {
    const animated = extension === 'gif' || extension === 'webp';
    try {
      let image = sharp(bytes, {
        animated,
        limitInputPixels: MAX_INPUT_PIXELS,
      });
      // Photos are often stored sideways with a note on how to turn them;
      // the note is dropped below, so the pixels are turned first.
      if (extension === 'jpg') image = image.rotate();
      image = image.resize({
        width: MAX_SIDE,
        height: MAX_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      });
      return await ENCODERS[extension](image).toBuffer();
    } catch {
      throw new BadRequestException('The image could not be read');
    }
  }
}
