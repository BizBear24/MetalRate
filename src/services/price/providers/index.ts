import type { PriceProvider } from '../types';
import { goldApiProvider } from './goldApi';

/** Register additional providers here; the id is stored in settings. */
export const PRICE_PROVIDERS: readonly PriceProvider[] = [goldApiProvider];

export function getProvider(id: string): PriceProvider {
  return PRICE_PROVIDERS.find((p) => p.id === id) ?? goldApiProvider;
}
