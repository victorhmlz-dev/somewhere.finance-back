import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JWTVerifyGetKey } from 'jose';
import { generateSiweNonce } from 'viem/siwe';
import type { Env } from '../config/env.js';
import type { WalletFamily } from '../generated/prisma/enums.js';
import { isUniqueViolation } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toOwnProfile } from '../users/user-profile.js';
import { RequestChallengeDto } from './dto/request-challenge.dto.js';
import { VerifySignatureDto } from './dto/verify-signature.dto.js';
import {
  PRIVY_KEYS,
  type PrivyIdentity,
  verifyPrivyIdentityToken,
} from './privy-identity.js';
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
    @Inject(PRIVY_KEYS) private readonly privyKeys: JWTVerifyGetKey | null,
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

    return { accessToken, user: toOwnProfile(user) };
  }

  /**
   * Signs in with the identity token of a Privy user, with no message to
   * sign: Privy already checked the user and their wallets.
   */
  async signInWithPrivy(identityToken: string) {
    const appId = this.config.get('PRIVY_APP_ID', { infer: true });
    if (!appId || !this.privyKeys) {
      throw new ServiceUnavailableException('Sign-in with Privy is not set up');
    }
    const identity = await verifyPrivyIdentityToken(
      identityToken,
      appId,
      this.privyKeys,
    );
    if (!identity) {
      throw new UnauthorizedException('Invalid or expired Privy token');
    }

    const userId = await this.userIdForIdentity(identity);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { wallets: true },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id });
    return { accessToken, user: toOwnProfile(user) };
  }

  /**
   * The account of a Privy user. The first time, it is the account that
   * already has one of their wallets (in Privy's order), so someone who used
   * Somewhere with MetaMask keeps their account; or a new one. Every linked
   * wallet that no account has yet joins it. A wallet of another account
   * stays where it is: accounts are never merged without the user asking.
   */
  private async userIdForIdentity(identity: PrivyIdentity): Promise<string> {
    const key = { provider: 'privy', subject: identity.subject };
    const known = await this.prisma.authIdentity.findUnique({
      where: { provider_subject: key },
    });

    let userId = known?.userId;
    if (!userId) {
      if (identity.wallets.length === 0) {
        // An email sign-up whose wallet Privy has not created yet
        throw new ConflictException(
          'Your wallet is still being created. Try again in a moment.',
        );
      }
      const owners = await this.prisma.wallet.findMany({
        where: { OR: identity.wallets },
      });
      const owner = identity.wallets
        .map((wallet) =>
          owners.find(
            (item) =>
              item.family === wallet.family && item.address === wallet.address,
          ),
        )
        .find(Boolean);
      // EVM first: launches live on EVM chains for now
      const primary =
        identity.wallets.find((wallet) => wallet.family === 'evm') ??
        identity.wallets[0];
      userId =
        owner?.userId ??
        (await this.findOrCreateUser(primary.family, primary.address)).id;

      try {
        await this.prisma.authIdentity.create({ data: { ...key, userId } });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // A concurrent sign-in of the same user linked it first
        userId = (
          await this.prisma.authIdentity.findUniqueOrThrow({
            where: { provider_subject: key },
          })
        ).userId;
      }
    }

    await this.prisma.wallet.createMany({
      data: identity.wallets.map((wallet) => ({ ...wallet, userId })),
      skipDuplicates: true,
    });
    return userId;
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
