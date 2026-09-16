import type { MetalPrice, PriceStatus } from '@/types';
import { readJSON, writeJSON } from '@/lib/storage';
import type { FxRate, MarketQuote, PriceProvider } from './types';
import { marketToPerGram } from './conversion';
import { getFxRate } from './fx';

export const TARGET_CURRENCY = 'INR';
/** A quote older than this is not called live (e.g. market closed / feed stalled). */
export const QUOTE_FRESH_MS = 30 * 60 * 1000;
/** A successful fetch older than this is not called live. */
export const FETCH_FRESH_MS = 3 * 60 * 1000;
const FX_REUSE_MS = 48 * 60 * 60 * 1000;

const CACHE_KEY = 'price-cache';

export interface PriceCache {
  gold?: MetalPrice;
  silver?: MetalPrice;
  fx?: FxRate;
}

export interface RefreshResult {
  gold: MetalPrice | Error;
  silver: MetalPrice | Error;
  fx?: FxRate;
}

export function loadPriceCache(): PriceCache {
  const c = readJSON<PriceCache>(CACHE_KEY, {});
  // Anything read from disk is by definition not live.
  if (c.gold) c.gold = { ...c.gold, isLive: false };
  if (c.silver) c.silver = { ...c.silver, isLive: false };
  return c;
}

function toMetalPrice(q: MarketQuote, fx: FxRate, fetchedAt: string): MetalPrice {
  const perGram = marketToPerGram(q.price, q.unit, fx.rate);
  return {
    metal: q.metal,
    pricePerGramINR: perGram,
    source: q.source,
    timestamp: q.timestamp,
    fetchedAt,
    isLive: Date.now() - new Date(q.timestamp).getTime() < QUOTE_FRESH_MS,
  };
}

async function resolveFx(cached: FxRate | undefined, signal?: AbortSignal): Promise<FxRate> {
  try {
    return await getFxRate('USD', TARGET_CURRENCY, signal);
  } catch (e) {
    // FX publishes once a day; a recent cached rate is still the current reference rate.
    if (cached && Date.now() - new Date(cached.timestamp).getTime() < FX_REUSE_MS) return cached;
    throw e;
  }
}

/** Market price → currency conversion → unit conversion → INR/gram, then caches. */
export async function refreshPrices(provider: PriceProvider, signal?: AbortSignal): Promise<RefreshResult> {
  const cache = readJSON<PriceCache>(CACHE_KEY, {});
  const [gold, silver, fx] = await Promise.allSettled([
    provider.getGoldPrice(signal),
    provider.getSilverPrice(signal),
    resolveFx(cache.fx, signal),
  ]);
  const fetchedAt = new Date().toISOString();

  const build = (r: PromiseSettledResult<MarketQuote>): MetalPrice | Error => {
    if (fx.status === 'rejected') return asError(fx.reason);
    if (r.status === 'rejected') return asError(r.reason);
    return toMetalPrice(r.value, fx.value, fetchedAt);
  };

  const result: RefreshResult = {
    gold: build(gold),
    silver: build(silver),
    fx: fx.status === 'fulfilled' ? fx.value : undefined,
  };

  writeJSON(CACHE_KEY, {
    gold: result.gold instanceof Error ? cache.gold : result.gold,
    silver: result.silver instanceof Error ? cache.silver : result.silver,
    fx: result.fx ?? cache.fx,
  } satisfies PriceCache);

  return result;
}

export function priceStatus(
  price: MetalPrice | undefined,
  opts: { failed: boolean; loading: boolean; fromCache: boolean; now: number },
): PriceStatus {
  if (!price) return opts.failed && !opts.loading ? 'unavailable' : 'loading';
  if (opts.failed) return 'offline';
  // Cached value shown while the first fetch of this session is in flight.
  if (opts.fromCache) return opts.loading ? 'loading' : 'offline';
  if (!price.isLive) return 'delayed';
  const quoteAge = opts.now - new Date(price.timestamp).getTime();
  const fetchAge = opts.now - new Date(price.fetchedAt).getTime();
  return quoteAge < QUOTE_FRESH_MS && fetchAge < FETCH_FRESH_MS ? 'live' : 'delayed';
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
