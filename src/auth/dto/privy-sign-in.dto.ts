import { IsString, Length } from 'class-validator';

export class PrivySignInDto {
  /** The identity token Privy gives the front once the user is signed in. */
  @IsString()
  @Length(20, 16000)
  identityToken: string;
}
