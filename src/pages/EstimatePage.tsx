import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { GstMode, Metal } from '@/types';
import { estimateStore, type DocKind, type PaymentMode } from '@/features/estimate/estimateStore';
import { useEstimateDraft } from '@/features/estimate/useEstimateDraft';
import { buildEstimate, type EstimateLine } from '@/features/estimate/buildEstimate';
import { EstimateDocument } from '@/features/estimate/EstimateDocument';
import { ScannerView } from '@/features/scanner/ScannerView';
import { useMetalPrice, usePriceState } from '@/features/pricing/usePrices';
import { priceStore } from '@/features/pricing/priceStore';
import { metalLabel } from '@/features/calculator/purity';
import { resolveBarcode } from '@/services/barcode/resolver';
import { itemsRepo } from '@/services/storage/itemsRepo';
import { useItems } from '@/hooks/useItems';
import { useSettings } from '@/hooks/useSettings';
import { formatDateTime, formatGrams, formatINR, formatRate, timeAgo } from '@/lib/format';
import { navigate } from '@/lib/router';
import { Page, PageHeader } from '@/components/Layout';
import { Button, IconButton } from '@/components/Button';
import { Segmented } from '@/components/Form';
import { ConfirmSheet, Sheet } from '@/components/Sheet';
import { StatusBadge } from '@/components/StatusBadge';
import { ItemThumb } from '@/components/ItemThumb';
import { useToast } from '@/components/Toast';
import { AlertIcon, ItemsIcon, PlusIcon, PrinterIcon, ReceiptIcon, ScanIcon, SearchIcon, ShareIcon, TrashIcon } from '@/components/Icons';

const KINDS: { value: DocKind; label: string }[] = [
  { value: 'estimate', label: 'Estimate' },
  { value: 'bill', label: 'Bill' },
];
const GST_MODES: { value: GstMode; label: string }[] = [
  { value: 'intra', label: 'CGST + SGST' },
  { value: 'inter', label: 'IGST' },
];
const PAYMENT_MODES: PaymentMode[] = ['', 'Cash', 'UPI', 'Card', 'Bank transfer', 'Old gold exchange'];

export function EstimatePage() {
  const draft = useEstimateDraft();
  const items = useItems();
  const { settings } = useSettings();
  const gold = useMetalPrice('gold');
  const silver = useMetalPrice('silver');
  const priceState = usePriceState();
  const toast = useToast();

  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [printing, setPrinting] = useState(false);

  const isBill = draft.kind === 'bill';
  const docName = isBill ? 'Bill' : 'Estimate';
  const number = estimateStore.numberFor(draft);

  useEffect(() => {
    priceStore.refreshIfStale(30_000);
  }, []);

  const totals = useMemo(
    () =>
      buildEstimate(
        draft.codes,
        (code) => resolveBarcode(code, settings.barcode, itemsRepo),
        (m) => (m === 'gold' ? gold.price : silver.price)?.pricePerGramINR,
        {
          adjustmentPct: settings.marketAdjustmentPct,
          gstPct: settings.estimate.gstPct,
          // Estimates show GST the same way as the bill they may become.
          gstMode: draft.gstMode,
        },
      ),
    // `items` changes identity whenever the item database changes.
    [draft.codes, draft.gstMode, items, settings, gold.price, silver.price],
  );

  const metalsUsed = [...new Set(totals.lines.flatMap((l) => (l.item ? [l.item.metal] : [])))] as Metal[];
  const views = metalsUsed.map((m) => (m === 'gold' ? gold : silver));
  const worst = views.find((v) => v.status === 'offline' || v.status === 'unavailable') ?? views.find((v) => v.status !== 'live') ?? views[0];
  const oldest = views.map((v) => v.price?.timestamp).filter(Boolean).sort()[0];
  const priceNote =
    !worst || worst.status === 'live' ? 'Live market rate' : worst.status === 'offline' ? 'Last known rate (offline)' : 'Latest available rate';
  const pricedAt = oldest ? formatDateTime(oldest) : '—';

  const addCode = (code: string) => {
    const r = resolveBarcode(code, settings.barcode, itemsRepo);
    if (r.status !== 'found') {
      toast(`${code} isn’t saved in GoldCalc`, 'error');
      return false;
    }
    if (!estimateStore.add(code)) {
      toast(`Already on this ${docName.toLowerCase()}`, 'error');
      return false;
    }
    toast(`Added ${r.item.name || `${metalLabel(r.item.metal)} ${r.item.purity}`}`);
    return true;
  };

  const print = async () => {
    if (!totals.complete) {
      toast('Remove the items that can’t be valued first', 'error');
      return;
    }
    if (isBill && !draft.customerName.trim()) {
      toast('Add the customer’s name for the bill', 'error');
      document.getElementById('customer-name')?.focus();
      return;
    }
    setPrinting(true);
    try {
      const last = priceState.lastAttemptAt ? Date.parse(priceState.lastAttemptAt) : 0;
      if (Date.now() - last > 30_000) await priceStore.refresh();
      estimateStore.markPrinted();
      // Let React commit the refreshed values and the assigned number before printing.
      // (A timer, not requestAnimationFrame: rAF pauses while the window is in the background,
      // which would pop the print dialog up later, out of context.)
      await new Promise((r) => setTimeout(r, 120));
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  const share = async () => {
    const b = totals.breakdown;
    const text = [
      `${settings.estimate.shopName || 'GoldCalc'} — ${isBill ? 'Tax Invoice' : 'Estimate'} ${number}`,
      draft.customerName && `Customer: ${draft.customerName}`,
      '',
      ...totals.lines
        .filter((l) => l.valuation)
        .flatMap((l, i) => {
          const it = l.item!;
          const v = l.valuation!;
          return [
            `${i + 1}. ${it.name || metalLabel(it.metal)} — ${metalLabel(it.metal)} ${it.purity}, ${formatGrams(it.weightGrams)}`,
            `   Metal ${formatGrams(it.weightGrams)} × ${formatRate(v.ratePerGram)} = ${formatINR(v.value)}`,
            ...v.charges.map((c) => `   + ${c.label} ${formatINR(c.amount)}`),
            `   Amount ${formatINR(v.total)}`,
          ];
        }),
      '',
      `Metal value ${formatINR(b.metalValue)}`,
      b.making > 0 && `Making charges ${formatINR(b.making)}`,
      b.stone > 0 && `Stone charges ${formatINR(b.stone)}`,
      b.diamond > 0 && `Diamond charges ${formatINR(b.diamond)}`,
      `${isBill ? 'Taxable value' : 'Subtotal'} ${formatINR(totals.subtotal)}`,
      ...totals.taxes.map((t) => `${t.label} ${t.pct}% ${formatINR(t.amount)}`),
      `${isBill ? 'Invoice total' : 'Estimated total'} ${formatINR(totals.total)}`,
      `${priceNote}, ${pricedAt}`,
    ]
      .filter((x) => x !== false && x !== undefined)
      .join('\n');
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast(`${docName} copied`);
      }
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast(`Couldn’t share ${docName.toLowerCase()}`, 'error');
    }
  };

  const empty = draft.codes.length === 0;
  const doc = <EstimateDocument draft={draft} number={number} totals={totals} shop={settings.estimate} pricedAt={pricedAt} priceNote={priceNote} />;
  const b = totals.breakdown;

  return (
    <Page>
      <PageHeader
        eyebrow={`${number}${draft.printed[draft.kind] ? ' · printed' : ''}`}
        title={docName}
        action={
          !empty && (
            <Button size="md" onClick={() => setConfirmNew(true)} icon={<PlusIcon size={16} />}>
              New
            </Button>
          )
        }
      />

      <Segmented label="Document type" value={draft.kind} options={KINDS} onChange={(kind) => estimateStore.update({ kind })} />

      {empty ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-full border border-line-strong text-champagne">
            <ReceiptIcon size={28} />
          </div>
          <p className="mt-5 font-display text-2xl">No items on this {docName.toLowerCase()}</p>
          <p className="mt-1 max-w-xs text-sm text-muted">
            Scan the customer’s pieces or pick saved items. Prices update live until you print.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <input
              id="customer-name"
              className="field h-12 text-sm"
              placeholder={isBill ? 'Customer name *' : 'Customer name'}
              aria-label="Customer name"
              value={draft.customerName}
              maxLength={60}
              onChange={(e) => estimateStore.update({ customerName: e.target.value })}
            />
            <input
              className="field num h-12 text-sm"
              placeholder="Phone (optional)"
              aria-label="Customer phone"
              inputMode="tel"
              value={draft.customerPhone}
              maxLength={20}
              onChange={(e) => estimateStore.update({ customerPhone: e.target.value })}
            />
          </div>

          {isBill && (
            <div className="mt-2 space-y-2">
              <input
                className="field h-12 text-sm"
                placeholder="Customer address (optional)"
                aria-label="Customer address"
                value={draft.customerAddress}
                maxLength={160}
                onChange={(e) => estimateStore.update({ customerAddress: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="field h-12 text-sm uppercase placeholder:normal-case"
                  placeholder="Customer GSTIN (B2B)"
                  aria-label="Customer GSTIN"
                  value={draft.customerGstin}
                  maxLength={15}
                  onChange={(e) => estimateStore.update({ customerGstin: e.target.value.toUpperCase() })}
                />
                <select
                  className="field h-12 text-sm"
                  aria-label="Payment mode"
                  value={draft.paymentMode}
                  onChange={(e) => estimateStore.update({ paymentMode: e.target.value as PaymentMode })}
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m || 'Payment mode'}
                    </option>
                  ))}
                </select>
              </div>
              {settings.estimate.gstPct > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-muted">GST type for this bill</p>
                  <Segmented
                    size="sm"
                    label="GST type"
                    value={draft.gstMode}
                    options={GST_MODES}
                    onChange={(gstMode) => estimateStore.update({ gstMode })}
                  />
                </div>
              )}
            </div>
          )}

          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface/50">
            {totals.lines.map((l) => (
              <LineRow key={l.code} line={l} onRemove={() => estimateStore.remove(l.code)} />
            ))}
          </ul>
        </>
      )}

      <div className={`grid grid-cols-2 gap-3 ${empty ? 'mt-8' : 'mt-3'}`}>
        <Button variant={empty ? 'gold' : 'outline'} icon={<ScanIcon size={18} />} onClick={() => setScanning(true)}>
          Scan item
        </Button>
        <Button icon={<ItemsIcon size={18} />} onClick={() => setPicking(true)}>
          From items
        </Button>
      </div>

      {!empty && (
        <>
          <section className="panel mt-6 px-5 py-4">
            <SumRow label={`Metal value · ${formatGrams(b.weightGrams)}`} value={formatINR(b.metalValue)} />
            <SumRow label="Making charges" value={b.making ? formatINR(b.making) : '—'} />
            <SumRow label="Stone charges" value={b.stone ? formatINR(b.stone) : '—'} />
            <SumRow label="Diamond charges" value={b.diamond ? formatINR(b.diamond) : '—'} />
            <div className="my-2 border-t border-line" />
            <SumRow label={isBill ? 'Taxable value' : 'Subtotal'} value={formatINR(totals.subtotal)} strong />
            {totals.taxes.map((t) => (
              <SumRow key={t.label} label={`${t.label} @ ${t.pct}%`} value={formatINR(t.amount)} />
            ))}
            <div className="hairline my-3" />
            <div className="flex items-baseline justify-between">
              <span className="eyebrow">{isBill ? 'Invoice Total' : 'Estimated Total'}</span>
              <span className="num gold-text text-[2rem] leading-none font-light">{formatINR(totals.total)}</span>
            </div>
            {worst && (
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <StatusBadge status={worst.status} />
                <span>Rates updated {timeAgo(oldest)}</span>
              </div>
            )}
          </section>

          {(!settings.estimate.shopName || (isBill && !settings.estimate.gstin)) && (
            <button
              type="button"
              onClick={() => navigate('/settings', { params: { section: 'estimate' } })}
              className="pressable mt-3 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-left text-sm text-warn"
            >
              <AlertIcon size={18} className="shrink-0" />
              {settings.estimate.shopName
                ? 'Add your GSTIN in Settings → Shop & Billing — it’s required on a tax invoice.'
                : 'Add your shop name, address and GSTIN in Settings → Shop & Billing.'}
            </button>
          )}

          <div className="mt-5 grid gap-3">
            <Button variant="gold" size="xl" block icon={<PrinterIcon />} onClick={() => void print()} disabled={printing || !totals.complete}>
              {printing ? 'Updating rates…' : `Print ${docName} / PDF`}
            </Button>
            <Button block icon={<ShareIcon size={18} />} onClick={() => void share()} disabled={!totals.complete}>
              Share as text
            </Button>
          </div>

          <h2 className="eyebrow mt-8 mb-2 px-1">Preview</h2>
          <ScaledPreview>{doc}</ScaledPreview>
        </>
      )}

      {/* The copy that is actually printed. Hidden on screen. */}
      {!empty && createPortal(<div className="print-portal">{doc}</div>, document.body)}

      {scanning && (
        <ScannerView title={`Scan items for the ${docName.toLowerCase()}`} onClose={() => setScanning(false)} onDetect={(code) => void addCode(code)} />
      )}
      <ItemPicker
        open={picking}
        onClose={() => setPicking(false)}
        chosen={draft.codes}
        onPick={(code) => {
          if (addCode(code)) setPicking(false);
        }}
      />
      <ConfirmSheet
        open={confirmNew}
        title={`Start a new ${docName.toLowerCase()}?`}
        body={`The items and customer on ${number} will be cleared. Print or share it first if you need a copy.`}
        confirmLabel="Start new"
        onClose={() => setConfirmNew(false)}
        onConfirm={() => {
          estimateStore.reset(settings.estimate.defaultGstMode);
          setConfirmNew(false);
        }}
      />
    </Page>
  );
}

function LineRow({ line, onRemove }: { line: EstimateLine; onRemove: () => void }) {
  const { item, valuation } = line;
  return (
    <li className="flex items-start gap-3 py-3 pr-1 pl-4">
      {item ? <ItemThumb itemId={item.itemId} hasPhoto={item.hasPhoto} metal={item.metal} size={40} /> : <span className="size-10" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-ink">{item ? item.name || `${metalLabel(item.metal)} item` : line.code}</span>
          <span className={`num shrink-0 font-semibold ${valuation ? 'text-ink' : 'text-danger'}`}>{valuation ? formatINR(valuation.total) : '—'}</span>
        </div>
        {item && valuation ? (
          <div className="num mt-0.5 space-y-px text-[0.76rem] text-muted">
            <div>
              {item.purity} · {formatGrams(item.weightGrams)} × {formatRate(valuation.ratePerGram)} = {formatINR(valuation.value)}
            </div>
            {valuation.charges.map((c) => (
              <div key={c.field}>
                + {c.label} {formatINR(c.amount)}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-0.5 text-[0.78rem] text-muted">
            {line.problem === 'not-found' ? 'No longer saved — remove it' : 'Waiting for price…'}
          </div>
        )}
      </div>
      <IconButton label="Remove" onClick={onRemove} className="!size-10 hover:!text-danger">
        <TrashIcon size={18} />
      </IconButton>
    </li>
  );
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className={strong ? 'font-medium text-ink' : 'text-muted'}>{label}</span>
      <span className={`num ${strong ? 'font-semibold' : 'font-medium'} text-ink`}>{value}</span>
    </div>
  );
}

/** Shows the fixed-width paper scaled down to fit the column. */
function ScaledPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const scale = Math.min(1, outer.current.clientWidth / inner.current.offsetWidth);
      setBox({ scale, height: inner.current.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="overflow-hidden rounded-xl border border-line-strong shadow-2xl shadow-black/30" style={{ height: box.height || undefined }}>
      <div ref={inner} className="w-max origin-top-left" style={{ transform: `scale(${box.scale})` }}>
        {children}
      </div>
    </div>
  );
}

function ItemPicker({
  open,
  onClose,
  onPick,
  chosen,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (code: string) => void;
  chosen: string[];
}) {
  const items = useItems();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? items.filter((i) => i.barcode.toLowerCase().includes(t) || i.name?.toLowerCase().includes(t)) : items).slice(0, 100);
  }, [items, q]);

  return (
    <Sheet open={open} onClose={onClose} labelledBy="pick-title">
      <h2 id="pick-title" className="font-display text-2xl font-medium text-ink">
        Add saved item
      </h2>
      <div className="relative mt-4">
        <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
        <input
          data-autofocus
          type="search"
          className="field pl-11"
          placeholder="Search barcode or name"
          aria-label="Search barcode or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="mt-3 max-h-[50dvh] divide-y divide-line overflow-y-auto">
        {list.map((i) => {
          const added = chosen.includes(i.barcode);
          return (
            <li key={i.id}>
              <button
                type="button"
                disabled={added}
                onClick={() => onPick(i.barcode)}
                className="pressable flex w-full cursor-pointer items-center gap-3 py-3 text-left"
              >
                <ItemThumb itemId={i.id} hasPhoto={i.hasPhoto} metal={i.metal} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{i.name || `${metalLabel(i.metal)} item`}</div>
                  <div className="num text-xs text-muted">
                    {i.purity} · {formatGrams(i.weightGrams)} · {i.barcode}
                  </div>
                </div>
                <span className="text-xs font-semibold text-gold">{added ? 'Added' : 'Add'}</span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="py-8 text-center text-sm text-muted">No matching items.</li>}
      </ul>
    </Sheet>
  );
}
