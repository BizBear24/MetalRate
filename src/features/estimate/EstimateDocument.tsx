import type { EstimateSettings } from '@/types';
import { formatGrams, formatINR, formatRate, maskBarcode } from '@/lib/format';
import { metalLabel } from '@/features/calculator/purity';
import { usePhoto } from '@/hooks/usePhoto';
import type { EstimateDraft } from './estimateStore';
import { rupeesInWords, type EstimateLine, type EstimateTotals } from './buildEstimate';

interface Props {
  draft: EstimateDraft;
  totals: EstimateTotals;
  shop: EstimateSettings;
  /** When the prices were taken, e.g. "17 Sep 2026, 6:15 pm". */
  pricedAt: string;
  priceNote: string;
}

/**
 * The paper estimate. Uses fixed print colours (not theme tokens) so it looks the same on
 * screen, in print and in both themes. Width is fixed; the preview scales it to fit.
 */
export function EstimateDocument({ draft, totals, shop, pricedAt, priceNote }: Props) {
  const lines = totals.lines.filter((l) => l.item && l.valuation);
  const dateText = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <article className="estimate-paper w-[720px] bg-white p-10 text-[12px] leading-snug text-[#1c1812]" style={{ fontFamily: 'Manrope, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="flex items-start justify-between gap-6 border-b-2 border-[#b08d45] pb-5">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-semibold" style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}>
            {shop.shopName || 'Your Shop Name'}
          </h1>
          {shop.address && <p className="mt-1 whitespace-pre-line text-[#5b5446]">{shop.address}</p>}
          <p className="mt-1 text-[#5b5446]">
            {[shop.phone && `Phone: ${shop.phone}`, shop.gstin && `GSTIN: ${shop.gstin}`].filter(Boolean).join('   ·   ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-bold tracking-[0.3em] text-[#b08d45]">ESTIMATE</div>
          <div className="mt-1 text-[15px] font-semibold">{draft.number}</div>
          <div className="mt-0.5 text-[#5b5446]">{dateText}</div>
        </div>
      </header>

      {/* Customer + rates */}
      <section className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] font-bold tracking-[0.18em] text-[#8a8170]">CUSTOMER</div>
          <div className="mt-1 min-h-[18px] text-[13px] font-medium">{draft.customerName || '—'}</div>
          {draft.customerPhone && <div className="text-[#5b5446]">{draft.customerPhone}</div>}
        </div>
        <div className="rounded-md border border-[#e6dfcf] bg-[#faf7f0] px-3 py-2">
          <div className="text-[10px] font-bold tracking-[0.18em] text-[#8a8170]">RATES APPLIED</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {totals.rates.map((r) => (
              <span key={`${r.metal}-${r.purity}`}>
                {metalLabel(r.metal)} {r.purity}: <b>{formatRate(r.ratePerGram)}/g</b>
              </span>
            ))}
          </div>
          <div className="mt-1 text-[10px] text-[#8a8170]">
            {priceNote} · {pricedAt}
          </div>
        </div>
      </section>

      {/* Lines */}
      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-[#1c1812] text-left text-[10px] font-bold tracking-[0.1em] text-[#5b5446]">
            <th className="w-6 py-2 pr-2">#</th>
            <th className="py-2 pr-2">ITEM</th>
            <th className="py-2 pr-2 text-right">NET WT</th>
            <th className="py-2 pr-2 text-right">RATE / G</th>
            <th className="py-2 pr-2 text-right">METAL VALUE</th>
            <th className="py-2 pr-2 text-right">CHARGES</th>
            <th className="py-2 text-right">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <Line key={l.code} line={l} index={i + 1} />
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <section className="mt-4 flex justify-between gap-8">
        <div className="max-w-[330px] self-end text-[11px] text-[#5b5446]">
          <div className="text-[10px] font-bold tracking-[0.18em] text-[#8a8170]">AMOUNT IN WORDS</div>
          <div className="mt-1 font-medium text-[#1c1812]">Rupees {rupeesInWords(totals.total)} Only</div>
        </div>
        <dl className="w-[240px] shrink-0 text-[12px]">
          <div className="flex justify-between py-1">
            <dt className="text-[#5b5446]">Subtotal</dt>
            <dd className="tabular-nums">{formatINR(totals.subtotal)}</dd>
          </div>
          {totals.gstPct > 0 && (
            <div className="flex justify-between py-1">
              <dt className="text-[#5b5446]">GST @ {totals.gstPct}%</dt>
              <dd className="tabular-nums">{formatINR(totals.gst)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t-2 border-[#1c1812] pt-2 text-[15px] font-bold">
            <dt>Estimated Total</dt>
            <dd className="tabular-nums">{formatINR(totals.total)}</dd>
          </div>
        </dl>
      </section>

      {/* Footer */}
      <footer className="mt-10 flex items-end justify-between gap-8 border-t border-[#e6dfcf] pt-4 text-[10px] text-[#8a8170]">
        <p className="max-w-[420px] whitespace-pre-line">{shop.footerNote}</p>
        <div className="shrink-0 text-center">
          <div className="mb-1 h-8 w-40 border-b border-[#8a8170]" />
          Authorised signatory
        </div>
      </footer>
      <p className="mt-4 text-center text-[9px] tracking-[0.2em] text-[#b5ad9c]">PREPARED WITH GOLDCALC</p>
    </article>
  );
}

function Line({ line, index }: { line: EstimateLine; index: number }) {
  const item = line.item!;
  const v = line.valuation!;
  const photo = usePhoto(item.itemId, !!item.hasPhoto);
  return (
    <tr className="border-b border-[#e6dfcf] align-top" style={{ breakInside: 'avoid' }}>
      <td className="py-2.5 pr-2 text-[#8a8170]">{index}</td>
      <td className="py-2.5 pr-2">
        <div className="flex gap-2.5">
          {photo && <img src={photo} alt="" className="size-11 shrink-0 rounded object-cover" />}
          <div className="min-w-0">
            <div className="font-semibold">{item.name || `${metalLabel(item.metal)} item`}</div>
            <div className="text-[11px] text-[#5b5446]">
              {metalLabel(item.metal)} {item.purity} · {maskBarcode(item.barcode)}
            </div>
          </div>
        </div>
      </td>
      <td className="py-2.5 pr-2 text-right tabular-nums">{formatGrams(item.weightGrams)}</td>
      <td className="py-2.5 pr-2 text-right tabular-nums">{formatRate(v.ratePerGram)}</td>
      <td className="py-2.5 pr-2 text-right tabular-nums">{formatINR(v.value)}</td>
      <td className="py-2.5 pr-2 text-right text-[11px] tabular-nums">
        {v.charges.length ? (
          v.charges.map((c) => (
            <div key={c.field}>
              <span className="text-[#8a8170]">{c.label.replace(' charges', '')}</span> {formatINR(c.amount)}
            </div>
          ))
        ) : (
          <span className="text-[#b5ad9c]">—</span>
        )}
      </td>
      <td className="py-2.5 text-right font-semibold tabular-nums">{formatINR(v.total)}</td>
    </tr>
  );
}
