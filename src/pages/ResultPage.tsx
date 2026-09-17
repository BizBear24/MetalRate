import type { ReactNode } from 'react';
import { useRoute, navigate, goBack } from '@/lib/router';
import { useValuation } from '@/features/calculator/useValuation';
import { formatPurity, metalLabel } from '@/features/calculator/purity';
import { chargeLines, type Valuation } from '@/features/calculator/calculate';
import { formatGrams, formatINR, formatRate, maskBarcode, timeAgo } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { Page } from '@/components/Layout';
import { Button, IconButton } from '@/components/Button';
import { CountUp } from '@/components/CountUp';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { CloseIcon, EditIcon, OfflineIcon, PlusIcon, RefreshIcon, ScanIcon, ShareIcon } from '@/components/Icons';
import type { ResolutionSource } from '@/types';

const SOURCE_LABEL: Record<ResolutionSource, string> = {
  encoded: 'Weight from barcode',
  'weight-embedded': 'Weight from barcode',
  database: 'Saved item',
};

export function ResultPage() {
  const { params } = useRoute();
  const code = params.get('code') ?? '';
  const { resolution, item, price, valuation, adjustmentPct } = useValuation(code);
  const now = useNow(5000);
  const toast = useToast();

  if (!item) {
    return (
      <Page nav={false} className="items-center justify-center text-center">
        <h1 className="font-display text-3xl font-medium">Item not found</h1>
        <p className="mt-2 text-sm text-muted">This barcode isn’t in GoldCalc yet.</p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button
            variant="gold"
            icon={<PlusIcon size={18} />}
            onClick={() =>
              navigate('/items/new', {
                replace: true,
                params: {
                  barcode: resolution.status === 'not-found' ? resolution.hint?.barcode ?? code : code,
                  weight: resolution.status === 'not-found' ? resolution.hint?.weightGrams?.toString() : undefined,
                  then: 'result',
                  code: resolution.status === 'not-found' ? resolution.scannedCode : undefined,
                },
              })
            }
          >
            Add Item
          </Button>
          <Button icon={<ScanIcon size={18} />} onClick={() => navigate('/scan', { replace: true })}>
            Scan Again
          </Button>
        </div>
      </Page>
    );
  }

  const metal = metalLabel(item.metal);
  const updated = price.price ? timeAgo(price.price.timestamp, now) : '—';
  const stale = price.status === 'offline' || price.status === 'delayed';
  const hasCharges = chargeLines(item).length > 0;

  const share = async () => {
    if (!valuation) return;
    const text = [
      hasCharges ? `GoldCalc — Estimated Total` : `GoldCalc — Estimated Metal Value`,
      item.name,
      `${metal} ${item.purity} · ${formatGrams(item.weightGrams)}`,
      `Rate ${formatRate(valuation.ratePerGram)}/g`,
      `Metal value ${formatINR(valuation.value)}`,
      ...valuation.charges.map((c) => `+ ${c.label} ${formatINR(c.amount)}`),
      hasCharges ? `Total ${formatINR(valuation.total)}` : null,
      `Price ${price.status === 'live' ? 'live' : 'last known'}, updated ${updated}`,
      `Excludes GST.`,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Result copied');
      }
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast('Couldn’t share result', 'error');
    }
  };

  return (
    <Page nav={false}>
      <header className="-mx-2 mb-4 flex items-center justify-between">
        <IconButton label="Close" onClick={() => goBack('/')}>
          <CloseIcon />
        </IconButton>
        <span className="eyebrow">{SOURCE_LABEL[item.source]}</span>
        <IconButton label="Share result" onClick={share} disabled={!valuation}>
          <ShareIcon size={20} />
        </IconButton>
      </header>

      {/* Identity */}
      <section className="text-center">
        <div className="inline-flex items-center gap-2.5">
          <span className={`text-[0.72rem] font-bold tracking-[0.32em] uppercase ${item.metal === 'gold' ? 'gold-text' : 'text-ink/80'}`}>
            {metal}
          </span>
          <span className="h-3 w-px bg-line-strong" />
          <span className="text-[0.72rem] font-bold tracking-[0.2em] text-champagne">{item.purity}</span>
        </div>
        {item.name && <h1 className="mt-2 font-display text-[1.6rem] leading-tight font-medium">{item.name}</h1>}
        <p className="num mt-1 text-xs tracking-wider text-faint">{maskBarcode(item.barcode)}</p>

        <div className="mt-7 flex items-end justify-center gap-5">
          <Metric label="Weight" value={formatGrams(item.weightGrams)} />
          <span className="pb-1.5 text-lg text-faint">×</span>
          <Metric
            label={`${item.purity} Rate`}
            value={valuation ? formatRate(valuation.ratePerGram) : '—'}
            suffix="/g"
            loading={!valuation && price.status === 'loading'}
          />
        </div>
      </section>

      <div className="hairline my-8" />

      {/* Hero value */}
      <section className="text-center" aria-live="polite">
        <div className="eyebrow">{hasCharges ? 'Estimated Total' : 'Estimated Value'}</div>
        {valuation ? (
          <div className="num gold-text mt-3 text-[clamp(3rem,15vw,4.6rem)] leading-none font-light">
            <CountUp value={valuation.total} format={formatINR} />
          </div>
        ) : price.status === 'loading' ? (
          <div className="skeleton mx-auto mt-3 h-16 w-64" aria-label="Loading price" />
        ) : (
          <PriceUnavailable onRetry={price.refresh} />
        )}
        {valuation && !hasCharges && (
          <p className="num mt-3 text-[0.8rem] text-muted">
            {formatGrams(item.weightGrams)} × {formatRate(valuation.ratePerGram)} = {formatINR(valuation.value)}
          </p>
        )}
        {valuation && hasCharges && <Breakdown valuation={valuation} weightGrams={item.weightGrams} />}
      </section>

      <div className="hairline my-8" />

      {/* Price freshness */}
      {price.price && (
        <section className="flex flex-col items-center gap-1.5 text-center">
          <StatusBadge status={price.status} prefix={price.status === 'live' ? 'Price' : undefined} />
          <span className="text-xs text-muted">
            {stale ? 'Last known market price · ' : ''}Updated {updated}
          </span>
        </section>
      )}

      {/* Details */}
      <dl className="mt-7 divide-y divide-line rounded-2xl border border-line bg-surface/50 px-5">
        <Row k="Weight" v={formatGrams(item.weightGrams)} />
        <Row k="Purity" v={formatPurity(item.metal, item.purity)} />
        <Row k="Metal" v={metal} />
        <Row k="Rate" v={valuation ? `${formatRate(valuation.ratePerGram)}/g` : '—'} />
        {adjustmentPct !== 0 && <Row k="Market adjustment" v={`${adjustmentPct > 0 ? '+' : ''}${adjustmentPct}%`} />}
      </dl>
      <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-faint">
        {hasCharges
          ? 'Metal value at the current rate plus this item’s fixed charges. Excludes GST.'
          : 'Metal value only — no making, stone or diamond charges saved for this item. Excludes GST.'}
      </p>

      <div className="mt-auto grid gap-3 pt-8">
        <Button variant="gold" size="xl" block icon={<ScanIcon />} onClick={() => navigate('/scan', { replace: true })}>
          Scan Another
        </Button>
        {item.itemId ? (
          <Button
            block
            icon={<EditIcon size={18} />}
            onClick={() =>
              navigate(`/items/${item.itemId}/edit`, {
                params: { then: 'result', code: item.source === 'weight-embedded' ? code : undefined },
              })
            }
          >
            Edit Item
          </Button>
        ) : (
          <Button
            block
            icon={<PlusIcon size={18} />}
            onClick={() =>
              navigate('/items/new', {
                params: {
                  barcode: item.barcode,
                  weight: String(item.weightGrams),
                  metal: item.metal,
                  purity: item.purity,
                  then: 'back',
                },
              })
            }
          >
            Save Item
          </Button>
        )}
      </div>
    </Page>
  );
}

function Metric({ label, value, suffix, loading }: { label: string; value: string; suffix?: string; loading?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className="eyebrow !text-[0.6rem]">{label}</span>
      <span className={`num mt-1.5 text-[1.55rem] leading-none font-medium text-ink ${loading ? 'skeleton' : ''}`}>
        {value}
        {suffix && <span className="ml-0.5 text-sm font-normal text-muted">{suffix}</span>}
      </span>
    </div>
  );
}

function Breakdown({ valuation, weightGrams }: { valuation: Valuation; weightGrams: number }) {
  return (
    <dl className="num mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-muted">
          Metal value
          <span className="ml-1.5 text-xs text-faint">
            {formatGrams(weightGrams)} × {formatRate(valuation.ratePerGram)}
          </span>
        </dt>
        <dd className="font-medium text-ink">{formatINR(valuation.value)}</dd>
      </div>
      {valuation.charges.map((c) => (
        <div key={c.field} className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">+ {c.label}</dt>
          <dd className="font-medium text-ink">{formatINR(c.amount)}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-line-strong pt-2">
        <dt className="font-semibold text-ink">Total</dt>
        <dd className="font-semibold text-gold">{formatINR(valuation.total)}</dd>
      </div>
    </dl>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 text-sm">
      <dt className="text-muted">{k}</dt>
      <dd className="num font-medium text-ink">{v}</dd>
    </div>
  );
}

function PriceUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-4 flex flex-col items-center">
      <OfflineIcon className="text-danger" />
      <p className="mt-3 font-medium text-ink">Live price unavailable</p>
      <p className="mt-1 max-w-xs text-sm text-muted">Connect to the internet once to load the market price.</p>
      <Button size="md" className="mt-4" icon={<RefreshIcon size={16} />} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
