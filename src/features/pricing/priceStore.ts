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
  /** Last time a fetch was attempted / succeeded (ISO). */
  lastAttemptAt?: string;
  lastSuccessAt?: string;
}

/** Target refresh interval while the app is open. */
export const POLL_MS = 60_000;
/** Retry sooner after a failure. */
const RETRY_MS = 15_000;
/** How often the watchdog checks whether a refresh is overdue. */
const WATCHDOG_MS = 5_000;

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
  let watchdog: ReturnType<typeof setInterval> | undefined;
  let lastAttempt = 0;

  const set = (patch: Partial<PriceState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const anyFailed = () => state.gold.failed || state.silver.failed;

  async function refresh(): Promise<void> {
    if (!provider) return;
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    lastAttempt = Date.now();
    set({ loading: true });

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({
        loading: false,
        lastAttemptAt: new Date().toISOString(),
        gold: { ...state.gold, failed: true, error: 'No internet connection' },
        silver: { ...state.silver, failed: true, error: 'No internet connection' },
      });
      inflight = null;
      return;
    }

    try {
      const r = await refreshPrices(provider, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const next = (prev: MetalState, v: MetalPrice | Error): MetalState =>
        v instanceof Error ? { ...prev, failed: true, error: v.message } : { price: v, failed: false, fromCache: false };
      const now = new Date().toISOString();
      const gold = next(state.gold, r.gold);
      const silver = next(state.silver, r.silver);
      set({
        gold,
        silver,
        fx: r.fx ?? state.fx,
        loading: false,
        lastAttemptAt: now,
        lastSuccessAt: gold.failed && silver.failed ? state.lastSuccessAt : now,
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

  /** Refreshes when the last attempt is older than `maxAgeMs` (and nothing is in flight). */
  function refreshIfStale(maxAgeMs = POLL_MS): void {
    if (inflight || !provider) return;
    if (Date.now() - lastAttempt >= maxAgeMs) void refresh();
  }

  // Background tabs and sleeping phones freeze timers, so a plain setInterval can leave
  // an old price on screen. A short watchdog compares wall-clock time instead, and every
  // "the user is back" signal triggers an immediate check.
  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    refreshIfStale(anyFailed() ? RETRY_MS : POLL_MS);
  };
  const onReturn = () => {
    if (document.visibilityState !== 'hidden') refreshIfStale(10_000);
  };
  const onOnline = () => void refresh();
  const onOffline = () => void refresh();
  const onInteract = () => refreshIfStale(POLL_MS);

  const RETURN_EVENTS = ['visibilitychange', 'focus', 'pageshow', 'resume'] as const;

  return {
    getState: () => state,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    refresh,
    refreshIfStale,
    /** Starts auto-refresh with the given provider. Returns a cleanup function. */
    start(p: PriceProvider) {
      const changed = provider?.id !== p.id;
      provider = p;
      if (changed) void refresh();
      clearInterval(watchdog);
      watchdog = setInterval(tick, WATCHDOG_MS);
      for (const ev of RETURN_EVENTS) {
        (ev === 'visibilitychange' || ev === 'resume' ? document : window).addEventListener(ev, onReturn);
      }
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      window.addEventListener('pointerdown', onInteract, { passive: true });
      return () => {
        clearInterval(watchdog);
        for (const ev of RETURN_EVENTS) {
          (ev === 'visibilitychange' || ev === 'resume' ? document : window).removeEventListener(ev, onReturn);
        }
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('pointerdown', onInteract);
      };
    },
    price(metal: Metal): MetalPrice | undefined {
      return state[metal].price;
    },
  };
}

export const priceStore = createPriceStore();
