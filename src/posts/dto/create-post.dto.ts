import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const MAX_POST_LENGTH = 280;

/** A post needs text, an image, or both. */
export class CreatePostDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MAX_POST_LENGTH)
  text?: string;

  /** URL of the image. */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  image?: string;

  /** Id of the post this one replies to. */
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}
