import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { generateSiweNonce } from 'viem/siwe';
import type { Env } from '../config/env.js';
import type { WalletFamily } from '../generated/prisma/enums.js';
import { isUniqueViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserProfile } from '../users/user-profile.js';
import { RequestChallengeDto } from './dto/request-challenge.dto.js';
import { VerifySignatureDto } from './dto/verify-signature.dto.js';
import {
  buildSignInMessage,
  normalizeAddress,
  verifyWalletSignature,
} from './wallet-signature.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ETHEREUM_MAINNET = 1;
const MAX_HANDLE_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async createChallenge(dto: RequestChallengeDto) {
    const address = normalizeAddress(dto.family, dto.address);
    if (!address) {
      throw new BadRequestException(`Invalid ${dto.family} wallet address`);
    }

    const front = new URL(this.config.get('FRONT_URL', { infer: true }));
    const nonce = generateSiweNonce();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
    const message = buildSignInMessage({
      family: dto.family,
      address,
      domain: front.host,
      uri: front.origin,
      chainId: dto.chainId ?? ETHEREUM_MAINNET,
      nonce,
      issuedAt,
      expiresAt,
    });

    await this.prisma.$transaction([
      // Expired challenges are useless; clearing them here keeps the table small.
      this.prisma.authChallenge.deleteMany({
        where: { family: dto.family, address, expiresAt: { lt: issuedAt } },
      }),
      this.prisma.authChallenge.create({
        data: { nonce, family: dto.family, address, message, expiresAt },
      }),
    ]);

    return { nonce, message, expiresAt: expiresAt.toISOString() };
  }

  async verifySignature(dto: VerifySignatureDto) {
    const challenge = await this.prisma.authChallenge.findUnique({
      where: { nonce: dto.nonce },
    });
    if (!challenge || challenge.usedAt || challenge.expiresAt <= new Date()) {
      throw new UnauthorizedException('Challenge is invalid or has expired');
    }

    const isValid = await verifyWalletSignature({
      family: challenge.family,
      address: challenge.address,
      message: challenge.message,
      signature: dto.signature,
    });
    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // The `usedAt: null` condition makes this atomic: of two requests replaying
    // the same signature, only one gets a session.
    const consumed = await this.prisma.authChallenge.updateMany({
      where: { id: challenge.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Challenge is invalid or has expired');
    }

    const user = await this.findOrCreateUser(
      challenge.family,
      challenge.address,
    );
    const accessToken = await this.jwt.signAsync({ sub: user.id });

    return { accessToken, user: toUserProfile(user) };
  }

  private async findOrCreateUser(family: WalletFamily, address: string) {
    const findByWallet = () =>
      this.prisma.user.findFirst({
        where: { wallets: { some: { family, address } } },
        include: { wallets: true },
      });

    const existing = await findByWallet();
    if (existing) return existing;

    for (let attempt = 0; attempt < MAX_HANDLE_ATTEMPTS; attempt++) {
      // First try a handle derived from the address; on a clash, a random one.
      const suffix =
        attempt === 0
          ? address.slice(-8).toLowerCase()
          : randomBytes(5).toString('hex');
      try {
        return await this.prisma.user.create({
          data: {
            handle: `user_${suffix}`,
            name: `${address.slice(0, 6)}…${address.slice(-4)}`,
            wallets: { create: { family, address, isPrimary: true } },
          },
          include: { wallets: true },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Either the handle is taken, or a concurrent login just created this
        // same wallet. In the second case that user is the one we want.
        const createdMeanwhile = await findByWallet();
        if (createdMeanwhile) return createdMeanwhile;
      }
    }

    throw new Error('Could not generate a unique handle for the new user');
  }
}
