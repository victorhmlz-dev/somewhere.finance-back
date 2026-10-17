import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LimitPerMinute, RATE_LIMITS } from '../common/rate-limits.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toOwnProfile } from '../users/user-profile.js';
import { AuthGuard, type AuthenticatedUser } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { RequestChallengeDto } from './dto/request-challenge.dto.js';
import { PrivySignInDto } from './dto/privy-sign-in.dto.js';
import { VerifySignatureDto } from './dto/verify-signature.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** Step 1 of the login: returns the message the wallet has to sign. */
  @LimitPerMinute(RATE_LIMITS.signIn)
  @Post('challenge')
  createChallenge(@Body() dto: RequestChallengeDto) {
    return this.auth.createChallenge(dto);
  }

  /** Step 2 of the login: exchanges the signed message for an access token. */
  @LimitPerMinute(RATE_LIMITS.signIn)
  @Post('verify')
  @HttpCode(200)
  verifySignature(@Body() dto: VerifySignatureDto) {
    return this.auth.verifySignature(dto);
  }

  /**
   * Signs in with Privy in one step: its identity token, with no message to
   * sign. The account is created, or found by one of the user's wallets.
   */
  @LimitPerMinute(RATE_LIMITS.signIn)
  @Post('privy')
  @HttpCode(200)
  signInWithPrivy(@Body() dto: PrivySignInDto) {
    return this.auth.signInWithPrivy(dto.identityToken);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      include: { wallets: true },
    });
    // The token is valid but the account behind it no longer exists.
    if (!user) throw new UnauthorizedException('User no longer exists');
    return toOwnProfile(user);
  }
}
