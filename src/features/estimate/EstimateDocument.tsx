import type { ReactNode } from 'react';
import type { EstimateSettings } from '@/types';
import { formatGrams, formatINR, formatRate } from '@/lib/format';
import { metalLabel } from '@/features/calculator/purity';
import { usePhoto } from '@/hooks/usePhoto';
import type { EstimateDraft } from './estimateStore';
import { rupeesInWords, type EstimateLine, type EstimateTotals } from './buildEstimate';

interface Props {
  draft: EstimateDraft;
  number: string;
  totals: EstimateTotals;
  shop: EstimateSettings;
  /** When the prices were taken, e.g. "17 Sep 2026, 6:15 pm". */
  pricedAt: string;
  priceNote: string;
}

const INK = '#1c1812';
const SOFT = '#5b5446';
const FAINT = '#8a8170';
const RULE = '#e6dfcf';
const GOLD = '#b08d45';

/**
 * The printable estimate / tax invoice with a full per-item breakdown. Uses fixed print
 * colours (not theme tokens) so it looks the same on screen, on paper and in both themes.
 */
export function EstimateDocument({ draft, number, totals, shop, pricedAt, priceNote }: Props) {
  const isBill = draft.kind === 'bill';
  const lines = totals.lines.filter((l) => l.item && l.valuation);
  const b = totals.breakdown;
  const dateText = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeText = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

  return (
    <article
      className="estimate-paper w-[760px] bg-white p-9 text-[11.5px] leading-snug"
      style={{ fontFamily: 'Manrope, system-ui, sans-serif', color: INK }}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-6 border-b-2 pb-4" style={{ borderColor: GOLD }}>
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-semibold" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}>
            {shop.shopName || 'Your Shop Name'}
          </h1>
          {shop.address && (
            <p className="mt-1 whitespace-pre-line" style={{ color: SOFT }}>
              {shop.address}
            </p>
          )}
          <p className="mt-1" style={{ color: SOFT }}>
            {[shop.phone && `Phone: ${shop.phone}`, shop.gstin && `GSTIN: ${shop.gstin}`].filter(Boolean).join('   ·   ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-bold tracking-[0.3em]" style={{ color: GOLD }}>
            {isBill ? 'TAX INVOICE' : 'ESTIMATE'}
          </div>
          <div className="mt-1 text-[15px] font-semibold">{number}</div>
          <div className="mt-0.5" style={{ color: SOFT }}>
            {dateText}, {timeText}
          </div>
          {isBill && shop.hsn && (
            <div className="mt-0.5" style={{ color: SOFT }}>
              HSN {shop.hsn}
            </div>
          )}
        </div>
      </header>

      {/* Customer + rates */}
      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <Caption>{isBill ? 'BILL TO' : 'CUSTOMER'}</Caption>
          <div className="mt-1 min-h-[18px] text-[13px] font-medium">{draft.customerName || '—'}</div>
          {draft.customerPhone && <div style={{ color: SOFT }}>{draft.customerPhone}</div>}
          {isBill && draft.customerAddress && (
            <div className="whitespace-pre-line" style={{ color: SOFT }}>
              {draft.customerAddress}
            </div>
          )}
          {isBill && draft.customerGstin && <div style={{ color: SOFT }}>GSTIN: {draft.customerGstin}</div>}
          {isBill && (
            <div className="mt-1" style={{ color: SOFT }}>
              Supply: {draft.gstMode === 'inter' ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}
              {draft.paymentMode && ` · Payment: ${draft.paymentMode}`}
            </div>
          )}
        </div>
        <div className="rounded-md border px-3 py-2" style={{ borderColor: RULE, background: '#faf7f0' }}>
          <Caption>RATES APPLIED</Caption>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {totals.rates.map((r) => (
              <span key={`${r.metal}-${r.purity}`}>
                {metalLabel(r.metal)} {r.purity}: <b>{formatRate(r.ratePerGram)}/g</b>
              </span>
            ))}
          </div>
          <div className="mt-1 text-[10px]" style={{ color: FAINT }}>
            {priceNote} · {pricedAt}
          </div>
        </div>
      </section>

      {/* Lines — full breakdown */}
      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="border-b text-left text-[9.5px] font-bold tracking-[0.06em]" style={{ borderColor: INK, color: SOFT }}>
            <Th className="w-5">#</Th>
            <Th>ITEM</Th>
            <Th right>NET WT</Th>
            <Th right>RATE/G</Th>
            <Th right>METAL VALUE</Th>
            <Th right>MAKING</Th>
            <Th right>STONE</Th>
            <Th right>DIAMOND</Th>
            <Th right last>AMOUNT</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <Line key={l.code} line={l} index={i + 1} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold" style={{ borderColor: INK }}>
            <td />
            <td className="py-2 pr-2">Total ({lines.length} item{lines.length === 1 ? '' : 's'})</td>
            <Num>{formatGrams(b.weightGrams)}</Num>
            <Num />
            <Num>{formatINR(b.metalValue)}</Num>
            <Num>{money(b.making)}</Num>
            <Num>{money(b.stone)}</Num>
            <Num>{money(b.diamond)}</Num>
            <Num last>{formatINR(totals.subtotal)}</Num>
          </tr>
        </tfoot>
      </table>

      {/* Totals */}
      <section className="mt-4 flex justify-between gap-8">
        <div className="max-w-[360px] self-end text-[11px]" style={{ color: SOFT }}>
          <Caption>AMOUNT IN WORDS</Caption>
          <div className="mt-1 font-medium" style={{ color: INK }}>
            Rupees {rupeesInWords(totals.total)} Only
          </div>
        </div>
        <dl className="w-[270px] shrink-0 text-[12px]">
          <SumRow label="Metal value" value={formatINR(b.metalValue)} />
          {b.making > 0 && <SumRow label="Making charges" value={formatINR(b.making)} />}
          {b.stone > 0 && <SumRow label="Stone charges" value={formatINR(b.stone)} />}
          {b.diamond > 0 && <SumRow label="Diamond charges" value={formatINR(b.diamond)} />}
          <div className="my-1 border-t" style={{ borderColor: RULE }} />
          <SumRow label={isBill ? 'Taxable value' : 'Subtotal'} value={formatINR(totals.subtotal)} strong />
          {totals.taxes.map((t) => (
            <SumRow key={t.label} label={`${t.label} @ ${t.pct}%`} value={formatINR(t.amount)} />
          ))}
          <div className="mt-1 flex justify-between border-t-2 pt-2 text-[15px] font-bold" style={{ borderColor: INK }}>
            <dt>{isBill ? 'Invoice Total' : 'Estimated Total'}</dt>
            <dd className="tabular-nums">{formatINR(totals.total)}</dd>
          </div>
        </dl>
      </section>

      {/* Footer */}
      <footer className="mt-9 flex items-end justify-between gap-8 border-t pt-4 text-[10px]" style={{ borderColor: RULE, color: FAINT }}>
        <p className="max-w-[440px] whitespace-pre-line">{isBill ? shop.billFooterNote : shop.footerNote}</p>
        <div className="shrink-0 text-center">
          <div className="mb-1 h-8 w-44 border-b" style={{ borderColor: FAINT }} />
          For {shop.shopName || 'the shop'} — Authorised signatory
        </div>
      </footer>
      <p className="mt-4 text-center text-[9px] tracking-[0.2em]" style={{ color: '#b5ad9c' }}>
        {isBill ? 'COMPUTER-GENERATED INVOICE · ' : ''}PREPARED WITH GOLDCALC
      </p>
    </article>
  );
}

const money = (n: number) => (n > 0 ? formatINR(n) : '—');

function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="text-[9.5px] font-bold tracking-[0.18em]" style={{ color: FAINT }}>
      {children}
    </div>
  );
}

function Th({ children, right, last, className = '' }: { children?: ReactNode; right?: boolean; last?: boolean; className?: string }) {
  return <th className={`py-2 ${last ? '' : 'pr-2'} ${right ? 'text-right' : ''} ${className}`}>{children}</th>;
}

function Num({ children, last }: { children?: ReactNode; last?: boolean }) {
  return <td className={`py-2 text-right whitespace-nowrap tabular-nums ${last ? '' : 'pr-2'}`}>{children}</td>;
}

function SumRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 ${strong ? 'font-semibold' : ''}`}>
      <dt style={{ color: strong ? INK : SOFT }}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Line({ line, index }: { line: EstimateLine; index: number }) {
  const item = line.item!;
  const v = line.valuation!;
  const photo = usePhoto(item.itemId, !!item.hasPhoto);
  return (
    <tr className="border-b align-top" style={{ borderColor: RULE, breakInside: 'avoid' }}>
      <td className="py-2 pr-2" style={{ color: FAINT }}>
        {index}
      </td>
      <td className="py-2 pr-2">
        <div className="flex gap-2">
          {photo && <img src={photo} alt="" className="size-10 shrink-0 rounded object-cover" />}
          <div className="min-w-0">
            <div className="font-semibold">{item.name || `${metalLabel(item.metal)} item`}</div>
            <div className="text-[10.5px]" style={{ color: SOFT }}>
              {metalLabel(item.metal)} {item.purity} · {item.barcode}
            </div>
          </div>
        </div>
      </td>
      <Num>{formatGrams(item.weightGrams)}</Num>
      <Num>{formatRate(v.ratePerGram)}</Num>
      <Num>{formatINR(v.value)}</Num>
      <Num>{money(item.makingCharges ?? 0)}</Num>
      <Num>{money(item.stoneCharges ?? 0)}</Num>
      <Num>{money(item.diamondCharges ?? 0)}</Num>
      <td className="py-2 text-right font-semibold whitespace-nowrap tabular-nums">{formatINR(v.total)}</td>
    </tr>
  );
}
