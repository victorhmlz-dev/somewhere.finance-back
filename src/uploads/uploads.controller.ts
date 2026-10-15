import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedUser } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { LimitPerMinute, RATE_LIMITS } from '../common/rate-limits.js';
import { UploadsService } from './uploads.service.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** What multer hands over for a file kept in memory. */
interface ReceivedFile {
  buffer: Buffer;
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Takes one image, sent as multipart form data in the field `file`, and
   * returns `{ url }`. The link is what profiles, posts and launches store.
   */
  @LimitPerMinute(RATE_LIMITS.uploads)
  @Post('images')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  uploadImage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @UploadedFile() file?: ReceivedFile,
  ) {
    if (!file)
      throw new BadRequestException('Send the image in the field "file"');
    return this.uploads.saveImage(currentUser.id, file.buffer);
  }

  @Get(':name')
  async serve(@Param('name') name: string, @Res() res: Response) {
    await this.uploads.assertExists(name);
    res.sendFile(name, {
      root: this.uploads.directory,
      // The name is the hash of the content, so a copy never goes stale
      maxAge: ONE_YEAR_IN_SECONDS * 1000,
      immutable: true,
      headers: {
        // Shown only as the image it is, never run as a page
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    });
  }
}
