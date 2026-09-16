import { useEffect, useSyncExternalStore } from 'react';
import type { Metal, MetalPrice, PriceStatus } from '@/types';
import { priceStatus } from '@/services/price/priceService';
import { getProvider } from '@/services/price/providers';
import { useNow } from '@/hooks/useNow';
import { priceStore } from './priceStore';

export interface MetalPriceView {
  metal: Metal;
  price?: MetalPrice;
  status: PriceStatus;
  error?: string;
}

/** Mount once near the root: starts polling the configured provider. */
export function usePricePolling(providerId: string) {
  useEffect(() => priceStore.start(getProvider(providerId)), [providerId]);
}

export function usePriceState() {
  return useSyncExternalStore(priceStore.subscribe, priceStore.getState, priceStore.getState);
}

export function useMetalPrice(metal: Metal): MetalPriceView & { refreshing: boolean; refresh: () => void } {
  const state = usePriceState();
  const now = useNow();
  const m = state[metal];
  return {
    metal,
    price: m.price,
    error: m.error,
    status: priceStatus(m.price, { failed: m.failed, loading: state.loading, fromCache: m.fromCache, now }),
    refreshing: state.loading,
    refresh: () => void priceStore.refresh(),
  };
}
