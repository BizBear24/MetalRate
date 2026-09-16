import type { FxProvider, FxRate } from './types';
import { fetchJSON } from './http';

/** open.er-api.com — free, no key, updated daily. */
const openErApi: FxProvider = {
  id: 'open.er-api.com',
  async getRate(from, to, signal) {
    const d = await fetchJSON<{
      result: string;
      time_last_update_unix: number;
      rates: Record<string, number>;
    }>(`https://open.er-api.com/v6/latest/${from}`, signal);
    const rate = d.rates?.[to];
    if (d.result !== 'success' || !(rate! > 0)) throw new Error('FX rate missing');
    return {
      from, to, rate: rate!,
      timestamp: new Date(d.time_last_update_unix * 1000).toISOString(),
      source: 'open.er-api.com',
    };
  },
};

/** Frankfurter (ECB reference rates) — free, no key. Used as a fallback. */
const frankfurter: FxProvider = {
  id: 'frankfurter',
  async getRate(from, to, signal) {
    const d = await fetchJSON<{ date: string; rates: Record<string, number> }>(
      `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`,
      signal,
    );
    const rate = d.rates?.[to];
    if (!(rate! > 0)) throw new Error('FX rate missing');
    return { from, to, rate: rate!, timestamp: new Date(d.date).toISOString(), source: 'frankfurter.dev' };
  },
};

const PROVIDERS = [openErApi, frankfurter];

export async function getFxRate(from: string, to: string, signal?: AbortSignal): Promise<FxRate> {
  if (from === to) return { from, to, rate: 1, timestamp: new Date().toISOString(), source: 'identity' };
  let lastError: unknown;
  for (const p of PROVIDERS) {
    try {
      return await p.getRate(from, to, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Exchange rate unavailable');
}
