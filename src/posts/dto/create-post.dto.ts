import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const MAX_POST_LENGTH = 280;

/** A post needs text, an image, or both. */
export class CreatePostDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MAX_POST_LENGTH)
  text?: string;

  /** Link to an image uploaded to this API (`POST /uploads/images`). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  image?: string;

  /** Id of the post this one replies to. */
  @IsOptional()
  @IsUUID()
  replyToId?: string;

  /**
   * Id of the launch this post comments on. A reply needs none: it belongs
   * to the launch of the post it replies to.
   */
  @IsOptional()
  @IsUUID()
  launchId?: string;
}
