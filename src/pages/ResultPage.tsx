import { useEffect, useState, type ReactNode } from 'react';
import { usePhoto } from '@/hooks/usePhoto';
import { priceStore } from '@/features/pricing/priceStore';
import { useRoute, navigate, goBack } from '@/lib/router';
import { useValuation } from '@/features/calculator/useValuation';
import { formatPurity, metalLabel } from '@/features/calculator/purity';
import { CHARGE_LABELS, chargeLines, type Valuation } from '@/features/calculator/calculate';
import { gstLines, type TaxLine } from '@/features/estimate/buildEstimate';
import { useSettings } from '@/hooks/useSettings';
import { CHARGE_FIELDS, type ItemCharges } from '@/types';
import { formatGrams, formatINR, formatRate, maskBarcode, timeAgo } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { Page } from '@/components/Layout';
import { Button, IconButton } from '@/components/Button';
import { CountUp } from '@/components/CountUp';
import { StatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/Toast';
import { CloseIcon, EditIcon, OfflineIcon, PlusIcon, ReceiptIcon, RefreshIcon, ScanIcon, ShareIcon } from '@/components/Icons';
import { estimateStore } from '@/features/estimate/estimateStore';
import { useEstimateDraft } from '@/features/estimate/useEstimateDraft';
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
  const { settings } = useSettings();
  const onEstimate = useEstimateDraft().codes.includes(code.trim());

  // Never value an item against a price that hasn't been checked in the last 30 s.
  useEffect(() => {
    priceStore.refreshIfStale(30_000);
  }, []);

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
  const taxes = valuation ? gstLines(valuation.total, settings.estimate.gstPct, settings.estimate.defaultGstMode) : [];
  const gst = taxes.reduce((sum, t) => sum + t.amount, 0);
  const grandTotal = valuation ? valuation.total + gst : 0;

  const share = async () => {
    if (!valuation) return;
    const text = [
      `GoldCalc — Price breakdown`,
      item.name,
      `${metal} ${item.purity} · ${formatGrams(item.weightGrams)}`,
      `Rate ${formatRate(valuation.ratePerGram)}/g`,
      `Metal value ${formatGrams(item.weightGrams)} × ${formatRate(valuation.ratePerGram)} = ${formatINR(valuation.value)}`,
      `Making charges ${item.makingCharges ? formatINR(item.makingCharges) : '—'}`,
      `Stone charges ${item.stoneCharges ? formatINR(item.stoneCharges) : '—'}`,
      `Diamond charges ${item.diamondCharges ? formatINR(item.diamondCharges) : '—'}`,
      `Total before GST ${formatINR(valuation.total)}`,
      ...taxes.map((t) => `${t.label} ${t.pct}% ${formatINR(t.amount)}`),
      taxes.length ? `Total incl. GST ${formatINR(grandTotal)}` : null,
      `Price ${price.status === 'live' ? 'live' : 'last known'}, updated ${updated}`,
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
        {item.hasPhoto && item.itemId && <HeroPhoto itemId={item.itemId} alt={item.name || `${metal} item`} />}
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
        <div className="eyebrow">{taxes.length ? 'Total incl. GST' : hasCharges ? 'Estimated Total' : 'Estimated Value'}</div>
        {valuation ? (
          <div className="num gold-text mt-3 text-[clamp(3rem,15vw,4.6rem)] leading-none font-light">
            <CountUp value={grandTotal} format={formatINR} />
          </div>
        ) : price.status === 'loading' ? (
          <div className="skeleton mx-auto mt-3 h-16 w-64" aria-label="Loading price" />
        ) : (
          <PriceUnavailable onRetry={price.refresh} />
        )}
        {valuation && <Breakdown valuation={valuation} weightGrams={item.weightGrams} item={item} taxes={taxes} grandTotal={grandTotal} />}
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
          ? 'Metal value at the current rate, plus this item’s fixed charges'
          : 'No making, stone or diamond charges saved for this item'}
        {taxes.length ? ` and GST @ ${settings.estimate.gstPct}%.` : '. GST not included.'}
      </p>

      <div className="mt-auto grid gap-3 pt-8">
        <Button variant="gold" size="xl" block icon={<ScanIcon />} onClick={() => navigate('/scan', { replace: true })}>
          Scan Another
        </Button>
        <div className="grid grid-cols-2 gap-3">
        <Button
          block
          icon={<ReceiptIcon size={18} />}
          disabled={!valuation}
          onClick={() => {
            if (estimateStore.add(code)) toast('Added to billing');
            navigate('/estimate');
          }}
        >
          {onEstimate ? 'Open billing' : 'Estimate / Bill'}
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

function HeroPhoto({ itemId, alt }: { itemId: string; alt: string }) {
  const url = usePhoto(itemId);
  const [zoom, setZoom] = useState(false);
  if (!url) return <div className="mx-auto mb-5 size-36" aria-hidden="true" />;
  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label="View photo"
        className="pressable animate-fade mx-auto mb-5 block size-36 cursor-zoom-in overflow-hidden rounded-[28px] border border-line-strong shadow-[0_20px_50px_-20px_var(--glow)]"
      >
        <img src={url} alt={alt} className="size-full object-cover" />
      </button>
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setZoom(false)}
          onKeyDown={(e) => e.key === 'Escape' && setZoom(false)}
          className="animate-fade fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/90 p-4"
        >
          <img src={url} alt={alt} className="max-h-full max-w-full rounded-2xl object-contain" />
          <IconButton label="Close photo" className="!absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 !text-white" autoFocus>
            <CloseIcon />
          </IconButton>
        </div>
      )}
    </>
  );
}

function Breakdown({
  valuation,
  weightGrams,
  item,
  taxes,
  grandTotal,
}: {
  valuation: Valuation;
  weightGrams: number;
  item: ItemCharges;
  taxes: TaxLine[];
  grandTotal: number;
}) {
  return (
    <dl className="num mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
      <BreakdownRow
        label={
          <>
            Metal value
            <span className="ml-1.5 text-xs text-faint">
              {formatGrams(weightGrams)} × {formatRate(valuation.ratePerGram)}
            </span>
          </>
        }
        value={formatINR(valuation.value)}
      />
      {CHARGE_FIELDS.map((f) => (
        <BreakdownRow key={f} label={`+ ${CHARGE_LABELS[f]}`} value={item[f] ? formatINR(item[f]!) : '—'} muted={!item[f]} />
      ))}
      <BreakdownRow label="Total before GST" value={formatINR(valuation.total)} rule strong={!taxes.length} />
      {taxes.map((t) => (
        <BreakdownRow key={t.label} label={`+ ${t.label} @ ${t.pct}%`} value={formatINR(t.amount)} />
      ))}
      {taxes.length > 0 && <BreakdownRow label="Total incl. GST" value={formatINR(grandTotal)} rule strong />}
    </dl>
  );
}

function BreakdownRow({ label, value, rule, strong, muted }: { label: ReactNode; value: string; rule?: boolean; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${rule ? 'border-t border-line-strong pt-2' : ''}`}>
      <dt className={strong ? 'font-semibold text-ink' : rule ? 'font-medium text-ink' : 'text-muted'}>{label}</dt>
      <dd className={strong ? 'font-semibold text-gold' : muted ? 'text-faint' : 'font-medium text-ink'}>{value}</dd>
    </div>
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
