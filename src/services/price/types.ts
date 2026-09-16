import type { Metal } from '@/types';

export type MassUnit = 'troy_ounce' | 'ounce' | 'gram' | 'kilogram';

/** A raw market quote exactly as the provider reports it. */
export interface MarketQuote {
  metal: Metal;
  price: number;
  currency: string;
  unit: MassUnit;
  /** Provider's publish time (ISO). */
  timestamp: string;
  source: string;
}

/** Swap implementations to change the market data source. */
export interface PriceProvider {
  id: string;
  label: string;
  homepage: string;
  getGoldPrice(signal?: AbortSignal): Promise<MarketQuote>;
  getSilverPrice(signal?: AbortSignal): Promise<MarketQuote>;
}

export interface FxRate {
  from: string;
  to: string;
  rate: number;
  timestamp: string;
  source: string;
}

export interface FxProvider {
  id: string;
  getRate(from: string, to: string, signal?: AbortSignal): Promise<FxRate>;
}
