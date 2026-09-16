import type { Metal, MetalPrice } from '@/types';
import type { FxRate, PriceProvider } from '@/services/price/types';
import { loadPriceCache, refreshPrices } from '@/services/price/priceService';

export interface MetalState {
  price?: MetalPrice;
  /** The most recent fetch attempt for this metal failed. */
  failed: boolean;
  /** Price came from the on-device cache and hasn't been refreshed this session. */
  fromCache: boolean;
  error?: string;
}

export interface PriceState {
  gold: MetalState;
  silver: MetalState;
  fx?: FxRate;
  loading: boolean;
  lastAttemptAt?: string;
}

const POLL_MS = 60_000;

type Listener = () => void;

function createPriceStore() {
  const cache = loadPriceCache();
  let state: PriceState = {
    gold: { price: cache.gold, failed: false, fromCache: !!cache.gold },
    silver: { price: cache.silver, failed: false, fromCache: !!cache.silver },
    fx: cache.fx,
    loading: false,
  };
  const listeners = new Set<Listener>();
  let provider: PriceProvider | null = null;
  let inflight: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const set = (patch: Partial<PriceState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  async function refresh(): Promise<void> {
    if (!provider) return;
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    set({ loading: true });

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({
        loading: false,
        lastAttemptAt: new Date().toISOString(),
        gold: { ...state.gold, failed: true, error: 'No internet connection' },
        silver: { ...state.silver, failed: true, error: 'No internet connection' },
      });
      return;
    }

    try {
      const r = await refreshPrices(provider, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const next = (prev: MetalState, v: MetalPrice | Error): MetalState =>
        v instanceof Error ? { ...prev, failed: true, error: v.message } : { price: v, failed: false, fromCache: false };
      set({
        gold: next(state.gold, r.gold),
        silver: next(state.silver, r.silver),
        fx: r.fx ?? state.fx,
        loading: false,
        lastAttemptAt: new Date().toISOString(),
      });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const error = (e as Error)?.message || 'Price service unavailable';
      set({
        gold: { ...state.gold, failed: true, error },
        silver: { ...state.silver, failed: true, error },
        loading: false,
        lastAttemptAt: new Date().toISOString(),
      });
    } finally {
      if (inflight === ctrl) inflight = null;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') {
      void refresh();
      startTimer();
    } else {
      stopTimer();
    }
  }
  function startTimer() {
    stopTimer();
    timer = setInterval(() => void refresh(), POLL_MS);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }
  const onOnline = () => void refresh();
  const onOffline = () => void refresh();

  return {
    getState: () => state,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    refresh,
    /** Starts polling with the given provider. Returns a cleanup function. */
    start(p: PriceProvider) {
      const changed = provider?.id !== p.id;
      provider = p;
      if (changed) void refresh();
      startTimer();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        stopTimer();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    },
    price(metal: Metal): MetalPrice | undefined {
      return state[metal].price;
    },
  };
}

export const priceStore = createPriceStore();
