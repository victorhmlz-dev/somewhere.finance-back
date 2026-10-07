import { IsString, Length, MaxLength } from 'class-validator';

export class VerifySignatureDto {
  @IsString()
  @Length(8, 96)
  nonce: string;

  /** EVM: 0x-prefixed hex. Solana: base58. */
  @IsString()
  @MaxLength(200)
  signature: string;
}
