import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { WalletFamily } from '../../generated/prisma/enums.js';

export class RequestChallengeDto {
  @IsIn(['evm', 'solana'])
  family: WalletFamily;

  @IsString()
  @MaxLength(64)
  address: string;

  /** EVM chain the wallet is connected to. Defaults to Ethereum mainnet. */
  @IsOptional()
  @IsInt()
  @Min(1)
  chainId?: number;
}
