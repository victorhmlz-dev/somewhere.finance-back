import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EvmChainConfig } from '../config/chains.js';
import type { Env } from '../config/env.js';
import type { Asset } from '../generated/prisma/client.js';
import type { TokenMetadata } from '../launchpad/chain-reader.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NATIVE_ADDRESS } from './asset-view.js';

/**
 * The assets of every configured chain. The native currency of each chain
 * is registered when the API starts, from its configuration; other assets
 * (stablecoins, tokenized stocks…) are added as launchpads allow them and
 * launches use them, with what each token says about itself and the label
 * the configuration gives it.
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

      // A label changed in the configuration applies to tokens already known
      if (chain.family !== 'evm') continue;
      for (const label of chain.assets) {
        await this.prisma.asset.updateMany({
          where: { chainKey: chain.key, address: label.address },
          data: {
            kind: label.kind,
            issuer: label.issuer,
            canFreeze: label.canFreeze,
          },
        });
      }
    }
  }

  /** The chain's own currency, registered when the API started. */
  async nativeOf(chainKey: string): Promise<Asset> {
    return this.prisma.asset.findUniqueOrThrow({
      where: { chainKey_address: { chainKey, address: NATIVE_ADDRESS } },
    });
  }

  /**
   * The asset of a token, registered the first time it is seen. `read` asks
   * the token for its symbol, name and decimals, and is only called then.
   */
  async ensureToken(
    chain: EvmChainConfig,
    address: string,
    read: () => Promise<TokenMetadata>,
  ): Promise<Asset> {
    const lower = address.toLowerCase();
    const key = { chainKey: chain.key, address: lower };
    const known = await this.prisma.asset.findUnique({
      where: { chainKey_address: key },
    });
    if (known) return known;

    const metadata = await read();
    const label = chain.assets.find((item) => item.address === lower);
    // Another process may register it at the same moment: whoever comes
    // second keeps the first one's row
    await this.prisma.asset.createMany({
      data: {
        ...key,
        // A token can say anything; the columns have a size
        symbol: metadata.symbol.slice(0, 32),
        name: metadata.name.slice(0, 100),
        decimals: metadata.decimals,
        kind: label?.kind ?? 'crypto',
        issuer: label?.issuer ?? null,
        canFreeze: label?.canFreeze ?? false,
      },
      skipDuplicates: true,
    });
    return this.prisma.asset.findUniqueOrThrow({
      where: { chainKey_address: key },
    });
  }
}
