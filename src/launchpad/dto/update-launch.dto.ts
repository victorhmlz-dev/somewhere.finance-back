import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';

const IsOptionalNotNull = () =>
  ValidateIf((_dto: object, value: unknown) => value !== undefined);

/**
 * What the creator of a launch can say about it. None of this is on chain,
 * and none of it changes the rules of the launch.
 */
export class UpdateLaunchDto {
  @IsOptionalNotNull()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(280)
  description?: string;

  /**
   * Link to an image uploaded to this API (`POST /uploads/images`). It can be
   * set once; after that the image of the launch never changes.
   */
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(2048)
  image?: string;
}
