import { useEffect, useRef, useState } from 'react';
import type { Metal } from '@/types';
import { useMetalPrice, usePriceState } from '@/features/pricing/usePrices';
import { formatRate, timeAgo } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { navigate } from '@/lib/router';
import { Page } from '@/components/Layout';
import { Wordmark } from '@/components/Logo';
import { Button, IconButton } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { roundRate } from '@/features/calculator/calculate';
import { OfflineIcon, PlusIcon, RefreshIcon, ScanIcon } from '@/components/Icons';

export function HomePage() {
  const state = usePriceState();
  const gold = useMetalPrice('gold');
  const now = useNow(5000);

  // Desktop shortcut: S opens the scanner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 's' || e.key === 'S') navigate('/scan');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const anyFailed = state.gold.failed || state.silver.failed;
  const hasCache = !!(state.gold.price || state.silver.price);
  const newest = [state.gold.price, state.silver.price]
    .filter(Boolean)
    .map((p) => p!.timestamp)
    .sort()
    .at(-1);

  return (
    <Page>
      <header className="flex items-center justify-between">
        <Wordmark />
        <IconButton label="Refresh prices" onClick={gold.refresh} disabled={state.loading} className="-mr-2">
          <RefreshIcon size={20} className={state.loading ? 'animate-spin' : ''} />
        </IconButton>
      </header>

      {anyFailed && !state.loading && (
        <div role="status" className="animate-page mt-6 flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/[0.06] p-4">
          <OfflineIcon size={20} className="mt-0.5 shrink-0 text-danger" />
          <div className="text-sm">
            <p className="font-semibold text-ink">Live price unavailable</p>
            <p className="mt-0.5 text-muted">
              {hasCache ? (
                <>Showing your last saved market price. Updated {timeAgo(newest, now)}.</>
              ) : (
                <>Connect to the internet to load today’s market price.</>
              )}
            </p>
          </div>
        </div>
      )}

      <section aria-label="Market prices" className="panel mt-7 overflow-hidden">
        <PriceRow metal="gold" />
        <div className="hairline mx-6" />
        <PriceRow metal="silver" />
      </section>
      <p className="mt-3 px-1 text-center text-[0.7rem] text-faint">
        International spot price in INR · {newest ? `Updated ${timeAgo(newest, now)}` : 'Waiting for first update'}
      </p>

      <div className="mt-auto flex flex-col items-center pt-10">
        <Button
          variant="gold"
          size="xl"
          block
          icon={<ScanIcon size={24} />}
          onClick={() => navigate('/scan')}
          className="h-[4.5rem] max-w-sm text-[1.02rem]"
          aria-keyshortcuts="S"
        >
          Scan Item
        </Button>
        <p className="mt-3 text-sm text-muted">Scan a barcode to calculate value</p>
        <Button variant="ghost" size="md" className="mt-3" icon={<PlusIcon size={16} />} onClick={() => navigate('/items/new')}>
          Add Item Manually
        </Button>
      </div>
    </Page>
  );
}

function PriceRow({ metal }: { metal: Metal }) {
  const { price, status } = useMetalPrice(metal);
  const flash = useFlashOnChange(price?.pricePerGramINR);
  const isGold = metal === 'gold';

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-6">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-[0.78rem] font-bold tracking-[0.28em] uppercase ${isGold ? 'gold-text' : 'text-ink/85'}`}>
            {isGold ? 'Gold' : 'Silver'}
          </span>
          <span className="text-[0.66rem] font-semibold tracking-[0.12em] text-faint">{isGold ? '24K' : '999'}</span>
        </div>
        <StatusBadge status={status} className="mt-2.5" />
      </div>
      <div className="text-right">
        {price ? (
          <div
            key={flash}
            className={`num leading-none font-light text-ink ${isGold ? 'text-[2.4rem]' : 'text-[2.05rem]'} ${flash ? 'animate-flash' : ''} ${
              status === 'offline' ? 'opacity-70' : ''
            }`}
          >
            {formatRate(roundRate(price.pricePerGramINR))}
          </div>
        ) : status === 'loading' ? (
          <div className="skeleton ml-auto h-9 w-36" aria-label="Loading price" />
        ) : (
          <div className="text-2xl font-light text-faint">—</div>
        )}
        <div className="mt-1.5 text-[0.7rem] tracking-[0.14em] text-muted uppercase">
          {status === 'offline' && price ? 'Last known · ' : ''}per gram
        </div>
      </div>
    </div>
  );
}

/** Returns an incrementing key whenever the rounded value changes (after the first value). */
function useFlashOnChange(value: number | undefined): number {
  const prev = useRef<number | undefined>(undefined);
  const [n, setN] = useState(0);
  const rounded = value == null ? undefined : Math.round(value);
  useEffect(() => {
    if (prev.current !== undefined && rounded !== undefined && rounded !== prev.current) setN((x) => x + 1);
    prev.current = rounded;
  }, [rounded]);
  return n;
}
