import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * What the creator of a launch can say about it. None of this is on chain,
 * and none of it changes the rules of the launch.
 */
export class UpdateLaunchDto {
  @ValidateIf((_dto: object, value: unknown) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(280)
  description?: string;

  /** URL of the image, or null to remove it. */
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  image?: string | null;
}
