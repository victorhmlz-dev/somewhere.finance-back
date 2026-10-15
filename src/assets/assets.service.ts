import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { Asset } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NATIVE_ADDRESS } from './asset-view.js';

/**
 * The assets of every configured chain. The native currency of each chain
 * is registered when the API starts, from its configuration; other assets
 * (stablecoins, tokenized stocks…) are added as launches use them.
 */
@Injectable()
export class AssetsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const chain of this.config.get('CHAINS', { infer: true })) {
      const { symbol, name, decimals } = chain.nativeCurrency;
      await this.prisma.asset.upsert({
        where: {
          chainKey_address: { chainKey: chain.key, address: NATIVE_ADDRESS },
        },
        create: {
          chainKey: chain.key,
          address: NATIVE_ADDRESS,
          symbol,
          name,
          decimals,
          kind: 'native',
        },
        update: { symbol, name, decimals },
      });
    }
  }

  /** The chain's own currency, registered when the API started. */
  async nativeOf(chainKey: string): Promise<Asset> {
    return this.prisma.asset.findUniqueOrThrow({
      where: { chainKey_address: { chainKey, address: NATIVE_ADDRESS } },
    });
  }
}
