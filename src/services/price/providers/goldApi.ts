import type { Metal } from '@/types';
import type { MarketQuote, PriceProvider } from '../types';
import { fetchJSON } from '../http';

/**
 * gold-api.com — free, no API key, CORS-enabled.
 * GET /price/XAU → { price: <USD per troy ounce>, updatedAt: ISO, ... }
 */
interface GoldApiResponse {
  name: string;
  price: number;
  symbol: string;
  currency?: string;
  updatedAt: string;
}

const BASE = (import.meta.env.VITE_PRICE_API_URL || 'https://api.gold-api.com').replace(/\/$/, '');

async function quote(symbol: 'XAU' | 'XAG', metal: Metal, signal?: AbortSignal): Promise<MarketQuote> {
  const data = await fetchJSON<GoldApiResponse>(`${BASE}/price/${symbol}`, signal);
  if (typeof data?.price !== 'number' || !(data.price > 0)) {
    throw new Error(`Unexpected ${symbol} response`);
  }
  return {
    metal,
    price: data.price,
    currency: data.currency || 'USD',
    unit: 'troy_ounce',
    timestamp: data.updatedAt || new Date().toISOString(),
    source: 'gold-api.com',
  };
}

export const goldApiProvider: PriceProvider = {
  id: 'gold-api',
  label: 'Gold API · international spot',
  homepage: 'https://gold-api.com',
  getGoldPrice: (signal) => quote('XAU', 'gold', signal),
  getSilverPrice: (signal) => quote('XAG', 'silver', signal),
};
