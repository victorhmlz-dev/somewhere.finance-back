import { Inject, Injectable, Logger } from '@nestjs/common';

/** Asks a price source for the dollar price of each id. Tests replace it. */
export type PriceSource = (ids: string[]) => Promise<Map<string, number>>;

/** Token under which the price source is provided. */
export const PRICE_SOURCE = Symbol('PRICE_SOURCE');

/** How long a price is reused before asking the source again. */
const PRICE_TTL_MS = 60_000;
/** How long to wait for the source before showing amounts without dollars. */
const PRICE_TIMEOUT_MS = 5_000;

/**
 * CoinGecko's public prices, by its ids ("ethereum", "binancecoin"…). Only
 * the ids leave the API, never anything about a user.
 */
export const coinGeckoPrices: PriceSource = async (ids) => {
  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', ids.join(','));
  url.searchParams.set('vs_currencies', 'usd');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PRICE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`CoinGecko answered ${response.status}`);
  const body = (await response.json()) as Record<string, { usd?: number }>;
  const prices = new Map<string, number>();
  for (const [id, value] of Object.entries(body)) {
    if (typeof value?.usd === 'number' && value.usd > 0)
      prices.set(id, value.usd);
  }
  return prices;
};

/**
 * Dollar prices, only to show values: nothing on chain ever depends on them.
 * Each price is kept for a minute. When the source fails, the last known
 * price is used, and without one the amount is shown without dollars.
 */
@Injectable()
export class PricesService {
  private readonly logger = new Logger(PricesService.name);
  private readonly cache = new Map<string, { usd: number; at: number }>();

  constructor(@Inject(PRICE_SOURCE) private readonly source: PriceSource) {}

  async usdPrices(ids: string[]): Promise<Map<string, number>> {
    const now = Date.now();
    const wanted = [...new Set(ids)];
    const stale = wanted.filter((id) => {
      const cached = this.cache.get(id);
      return !cached || now - cached.at > PRICE_TTL_MS;
    });
    if (stale.length > 0) {
      try {
        const fresh = await this.source(stale);
        for (const [id, usd] of fresh) this.cache.set(id, { usd, at: now });
      } catch (error) {
        this.logger.warn(
          `Prices not refreshed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const prices = new Map<string, number>();
    for (const id of wanted) {
      const cached = this.cache.get(id);
      if (cached) prices.set(id, cached.usd);
    }
    return prices;
  }
}
