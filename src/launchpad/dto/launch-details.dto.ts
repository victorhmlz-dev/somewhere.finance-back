import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * What the creator says about a launch: not on chain, and set once, before
 * the sale starts. It never changes the rules of the launch.
 */
export class LaunchDetailsDto {
  @Transform(trim)
  @IsString()
  @MaxLength(280)
  description: string = '';

  /** Link to an image uploaded to this API (`POST /uploads/images`). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  image?: string;
}

/**
 * The same, sent right after the transaction that creates the launch, before
 * the API has indexed it. The transaction says which launch it is for.
 */
export class PendingLaunchDetailsDto extends LaunchDetailsDto {
  /** Key of the chain the launch was created on. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(32)
  chain!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(/^0x[0-9a-f]{64}$/, { message: 'txHash must be a transaction hash' })
  txHash!: string;
}
