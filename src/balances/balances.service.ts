import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatUnits, type Hex } from 'viem';
import {
  type AssetView,
  toAssetView,
  NATIVE_ADDRESS,
} from '../assets/asset-view.js';
import type { EvmChainConfig } from '../config/chains.js';
import type { Env } from '../config/env.js';
import type { Asset } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BALANCE_READER_FACTORY,
  type BalanceReader,
  type BalanceReaderFactory,
} from './balance-reader.js';
import { PricesService } from './prices.service.js';

/** Gas a typical action takes: a purchase, a claim, an approval. */
const GAS_PER_ACTION = 250_000n;
/** Native currency worth keeping: enough for this many actions. */
const SUGGESTED_ACTIONS = 10n;
/** Below this many actions left, the wallet is low on gas. */
const LOW_ACTIONS = 5n;
/** How long the balances of a user are reused before reading the chains again. */
const BALANCES_TTL_MS = 30_000;

/** One asset held in one wallet. Amounts in the asset's smallest unit. */
export interface BalanceItem {
  chainKey: string;
  chainName: string;
  wallet: string;
  asset: AssetView;
  amount: string;
  /** Its value in dollars, to show it. Null when there is no price for it. */
  usd: number | null;
  /** For a token launched on Somewhere, the launch it comes from. */
  launchId: string | null;
}

/** Whether a wallet can pay the fees of a chain, in its currency. */
export interface GasStatus {
  chainKey: string;
  chainName: string;
  wallet: string;
  nativeAmount: string;
  /** "ok": several actions covered; "low": a few; "empty": none. */
  level: 'ok' | 'low' | 'empty';
  /** Roughly how many actions the balance pays for. Null if fees are free. */
  actionsLeft: number | null;
  /** What is worth keeping, in the smallest unit, and in dollars if known. */
  suggestedAmount: string;
  suggestedUsd: number | null;
}

export interface Balances {
  /** Every asset with a price, in dollars. */
  totalUsd: number;
  items: BalanceItem[];
  gas: GasStatus[];
  /** Chains that could not be read right now. */
  unavailable: string[];
  updatedAt: string;
}

const toUnits = (amount: bigint, decimals: number) =>
  Number(formatUnits(amount, decimals));

/**
 * What the wallets of an account hold on every EVM chain configured, read
 * from the chains each time (and kept 30 seconds), never stored. Dollar
 * values are only for showing: stablecoins count as $1, the native currency
 * and labelled assets use the price source, a listed launch token its
 * exchange pool. Tokenized stocks have no price yet.
 */
@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);
  private readonly chains: EvmChainConfig[];
  private readonly readers = new Map<string, BalanceReader>();
  private readonly cache = new Map<
    string,
    { at: number; balances: Balances }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
    @Inject(BALANCE_READER_FACTORY)
    private readonly createReader: BalanceReaderFactory,
    config: ConfigService<Env, true>,
  ) {
    this.chains = config
      .get('CHAINS', { infer: true })
      .filter((chain): chain is EvmChainConfig => chain.family === 'evm');
  }

  async forUser(userId: string): Promise<Balances> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < BALANCES_TTL_MS)
      return cached.balances;

    const wallets = (
      await this.prisma.wallet.findMany({ where: { userId, family: 'evm' } })
    ).map((wallet) => wallet.address as Hex);

    const balances: Balances = {
      totalUsd: 0,
      items: [],
      gas: [],
      unavailable: [],
      updatedAt: new Date().toISOString(),
    };
    for (const chain of this.chains) {
      try {
        await this.readChain(chain, wallets, balances);
      } catch (error) {
        // One chain that does not answer does not hide the others
        balances.unavailable.push(chain.key);
        this.logger.warn(
          `Balances of ${chain.key} not read: ${error instanceof Error ? error.message : String(error)}`.replaceAll(
            chain.rpcUrl,
            '<node URL>',
          ),
        );
      }
    }
    balances.items.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1));
    balances.totalUsd = balances.items.reduce(
      (sum, item) => sum + (item.usd ?? 0),
      0,
    );

    this.cache.set(userId, { at: Date.now(), balances });
    return balances;
  }

  private readerOf(chain: EvmChainConfig): BalanceReader {
    let reader = this.readers.get(chain.key);
    if (!reader) {
      reader = this.createReader(chain);
      this.readers.set(chain.key, reader);
    }
    return reader;
  }

  private async readChain(
    chain: EvmChainConfig,
    wallets: Hex[],
    balances: Balances,
  ): Promise<void> {
    if (wallets.length === 0) return;
    const reader = this.readerOf(chain);
    const assets = await this.prisma.asset.findMany({
      where: { chainKey: chain.key },
    });
    const native = assets.find((asset) => asset.address === NATIVE_ADDRESS);
    const tokens = assets.filter((asset) => asset.address !== NATIVE_ADDRESS);

    // Launch tokens this account bought or created, once listed
    const launches = await this.prisma.launch.findMany({
      where: {
        chainKey: chain.key,
        launchpad: { in: chain.launchpads.map((item) => item.address) },
        pairAddress: { not: null },
        OR: [
          { creatorAddress: { in: wallets } },
          { contributions: { some: { contributor: { in: wallets } } } },
        ],
      },
      include: { quoteAsset: true },
    });

    // Dollar prices of what has one
    const priceIdOf = (asset: Asset) =>
      asset.address === NATIVE_ADDRESS
        ? (chain.nativeCurrency.priceId ?? null)
        : (chain.assets.find((label) => label.address === asset.address)
            ?.priceId ?? null);
    const prices = await this.prices.usdPrices(
      assets.map(priceIdOf).filter((id): id is string => id !== null),
    );
    const usdPriceOf = (asset: Asset): number | null => {
      const id = priceIdOf(asset);
      if (id) return prices.get(id) ?? null;
      return asset.kind === 'stablecoin' ? 1 : null;
    };
    const usdOf = (asset: Asset, amount: bigint) => {
      const price = usdPriceOf(asset);
      return price === null ? null : toUnits(amount, asset.decimals) * price;
    };

    const gasPrice = await reader.getGasPrice();
    const actionCost = gasPrice * GAS_PER_ACTION;
    const suggested = actionCost * SUGGESTED_ACTIONS;

    for (const wallet of wallets) {
      const item = (
        asset: Asset,
        amount: bigint,
        launchId: string | null = null,
      ) => ({
        chainKey: chain.key,
        chainName: chain.name,
        wallet,
        asset: toAssetView(asset),
        amount: amount.toString(),
        usd: usdOf(asset, amount),
        launchId,
      });

      const nativeAmount = await reader.getNativeBalance(wallet);
      if (native) {
        // Always listed: it pays the fees
        balances.items.push(item(native, nativeAmount));
        const actionsLeft = actionCost > 0n ? nativeAmount / actionCost : null;
        balances.gas.push({
          chainKey: chain.key,
          chainName: chain.name,
          wallet,
          nativeAmount: nativeAmount.toString(),
          level:
            actionsLeft === null || actionsLeft >= LOW_ACTIONS
              ? 'ok'
              : actionsLeft >= 1n
                ? 'low'
                : 'empty',
          actionsLeft: actionsLeft === null ? null : Number(actionsLeft),
          suggestedAmount: suggested.toString(),
          suggestedUsd: usdOf(native, suggested),
        });
      }

      for (const token of tokens) {
        const amount = await reader.getTokenBalance(
          token.address as Hex,
          wallet,
        );
        if (amount > 0n) balances.items.push(item(token, amount));
      }

      for (const launch of launches) {
        const amount = await reader.getTokenBalance(
          launch.tokenAddress as Hex,
          wallet,
        );
        if (amount === 0n) continue;
        // The token as an asset, priced by its exchange pool
        const tokenAsset: Asset = {
          ...launch.quoteAsset,
          id: launch.id,
          address: launch.tokenAddress,
          symbol: launch.symbol,
          name: launch.name,
          decimals: launch.tokenDecimals,
          kind: 'crypto',
          issuer: null,
          canFreeze: false,
        };
        const quoteUsd = usdPriceOf(launch.quoteAsset);
        let usd: number | null = null;
        if (quoteUsd !== null) {
          const pool = await reader.getPairReserves(launch.pairAddress as Hex);
          const tokenIsFirst =
            pool.token0.toLowerCase() === launch.tokenAddress;
          const tokenReserve = tokenIsFirst ? pool.reserve0 : pool.reserve1;
          const quoteReserve = tokenIsFirst ? pool.reserve1 : pool.reserve0;
          if (tokenReserve > 0n) {
            const priceInQuote =
              toUnits(quoteReserve, launch.quoteAsset.decimals) /
              toUnits(tokenReserve, launch.tokenDecimals);
            usd =
              toUnits(amount, launch.tokenDecimals) * priceInQuote * quoteUsd;
          }
        }
        balances.items.push({ ...item(tokenAsset, amount, launch.id), usd });
      }
    }
  }
}
