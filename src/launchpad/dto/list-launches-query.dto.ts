import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.js';

/** The three groups the front filters launches by. */
export const LAUNCH_STATUS_FILTERS = ['upcoming', 'live', 'ended'] as const;
export type LaunchStatusFilter = (typeof LAUNCH_STATUS_FILTERS)[number];

const lowercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class ListLaunchesQueryDto extends PaginationQueryDto {
  /** Key of a configured chain, e.g. "ethereum". */
  @IsOptional()
  @Transform(lowercase)
  @IsString()
  @MaxLength(32)
  chain?: string;

  /** "ended" covers everything that no longer takes contributions. */
  @IsOptional()
  @IsIn(LAUNCH_STATUS_FILTERS)
  status?: LaunchStatusFilter;

  /** Wallet address of the creator. */
  @IsOptional()
  @Transform(lowercase)
  @Matches(/^0x[0-9a-f]{40}$/, { message: 'creator must be a wallet address' })
  creator?: string;

  /** Text to look for in the name or the symbol. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(50)
  q?: string;
}
