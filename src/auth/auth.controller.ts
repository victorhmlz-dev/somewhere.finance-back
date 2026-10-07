import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserProfile } from '../users/user-profile.js';
import { AuthGuard, type AuthenticatedUser } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { RequestChallengeDto } from './dto/request-challenge.dto.js';
import { VerifySignatureDto } from './dto/verify-signature.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  /** Step 1 of the login: returns the message the wallet has to sign. */
  @Post('challenge')
  createChallenge(@Body() dto: RequestChallengeDto) {
    return this.auth.createChallenge(dto);
  }

  /** Step 2 of the login: exchanges the signed message for an access token. */
  @Post('verify')
  @HttpCode(200)
  verifySignature(@Body() dto: VerifySignatureDto) {
    return this.auth.verifySignature(dto);
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
    return toUserProfile(user);
  }
}
