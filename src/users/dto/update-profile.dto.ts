import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// Unlike `@IsOptional`, this lets a field be left out but not sent as null.
const IsOptionalNotNull = () =>
  ValidateIf((_dto: object, value: unknown) => value !== undefined);

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Every field is optional: only the ones sent are changed. */
export class UpdateProfileDto {
  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  /** Stored in lowercase, so `Aria` and `aria` are the same handle. */
  @IsOptionalNotNull()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9_]{3,15}$/, {
    message:
      'handle must be 3 to 15 characters: letters, numbers and underscores',
  })
  handle?: string;

  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  bio?: string;

  /**
   * Link to an image uploaded to this API (`POST /uploads/images`), or null
   * to remove it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatar?: string | null;
}
