import { useRef, useState, type ReactNode } from 'react';
import type { AppSettings, BarcodeSettings, ThemePreference } from '@/types';
import { useSettings } from '@/hooks/useSettings';
import { useItems } from '@/hooks/useItems';
import { usePriceState } from '@/features/pricing/usePrices';
import { priceStore } from '@/features/pricing/priceStore';
import { PRICE_PROVIDERS, getProvider } from '@/services/price/providers';
import { itemsRepo } from '@/services/storage/itemsRepo';
import { DEFAULT_SETTINGS } from '@/services/storage/settingsRepo';
import { resolveBarcode } from '@/services/barcode/resolver';
import { formatGrams, timeAgo } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { metalLabel } from '@/features/calculator/purity';
import { Page, PageHeader } from '@/components/Layout';
import { Segmented, Toggle } from '@/components/Form';
import { ConfirmSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { LogoMark } from '@/components/Logo';
import { DownloadIcon, RefreshIcon, TrashIcon, UploadIcon } from '@/components/Icons';
import { InventoryImport } from '@/features/items/InventoryImport';
import { downloadInventoryTemplate, exportInventoryWorkbook } from '@/services/storage/inventorySheet';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Auto' },
];

export function SettingsPage() {
  const { settings, update } = useSettings();
  const items = useItems();
  const prices = usePriceState();
  const now = useNow(10000);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<null | 'clear' | 'demo'>(null);
  const [importing, setImporting] = useState(false);

  const provider = getProvider(settings.priceProviderId);
  const demoCount = items.filter((i) => i.isDemo).length;

  const setBarcode = (fn: (b: BarcodeSettings) => BarcodeSettings) =>
    update((s: AppSettings) => ({ ...s, barcode: fn(s.barcode) }));

  const makeFile = async (task: () => Promise<void>, done: string) => {
    try {
      await task();
      toast(done);
    } catch {
      toast('Couldn’t create the file', 'error');
    }
  };

  const backupItems = () => {
    const blob = new Blob([itemsRepo.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `goldcalc-items-${new Date().toISOString().slice(0, 10)}.json`,
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Backed up ${items.length} item${items.length === 1 ? '' : 's'}`);
  };

  const restoreItems = async (file: File) => {
    try {
      const r = itemsRepo.import(await file.text());
      toast(`Imported ${r.added} new, ${r.updated} updated${r.skipped ? `, ${r.skipped} skipped` : ''}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Page>
      <PageHeader title="Settings" />

      <Section title="Price">
        <Row label="Gold price source" detail="Spot XAU/USD, live">
          <ProviderSelect value={settings.priceProviderId} onChange={(id) => update((s) => ({ ...s, priceProviderId: id }))} />
        </Row>
        <Row label="Silver price source" detail="Spot XAG/USD, live">
          <span className="text-sm font-medium text-ink">{new URL(provider.homepage).host}</span>
        </Row>
        <Row label="Currency" detail="Indian numbering · ₹1,25,430">
          <span className="text-sm font-semibold text-ink">INR ₹</span>
        </Row>
        <Row
          label="Exchange rate"
          detail={prices.fx ? `${prices.fx.source} · updated ${timeAgo(prices.fx.timestamp, now)}` : 'Not loaded yet'}
        >
          <span className="num text-sm font-medium text-ink">{prices.fx ? `$1 = ₹${prices.fx.rate.toFixed(2)}` : '—'}</span>
        </Row>
        <Row
          label="Market adjustment"
          detail="Optional % added to the converted spot price, e.g. to reflect import duty. 0 = pure spot."
        >
          <AdjustmentInput value={settings.marketAdjustmentPct} onChange={(n) => update((s) => ({ ...s, marketAdjustmentPct: n }))} />
        </Row>
        <ActionRow
          icon={<RefreshIcon size={18} className={prices.loading ? 'animate-spin' : ''} />}
          label="Refresh prices now"
          onClick={() => void priceStore.refresh()}
        />
      </Section>

      <Section title="Appearance">
        <div className="py-3">
          <Segmented label="Theme" size="sm" value={settings.theme} options={THEMES} onChange={(theme) => update((s) => ({ ...s, theme }))} />
        </div>
      </Section>

      <Section title="Scanner">
        <Row label="Weight in barcode" detail={<>Text codes like <Code>GOLD-22-000125-8.42</Code></>}>
          <Toggle
            label="Weight in barcode"
            checked={settings.barcode.encoded.enabled}
            onChange={(enabled) => setBarcode((b) => ({ ...b, encoded: { ...b.encoded, enabled } }))}
          />
        </Row>
        {settings.barcode.encoded.enabled && (
          <Row label="Separator" detail="METAL · PURITY · ITEM ID · WEIGHT (g)" nested>
            <input
              aria-label="Separator"
              className="field h-11 w-16 text-center font-semibold"
              maxLength={1}
              value={settings.barcode.encoded.separator}
              onChange={(e) => {
                const v = e.target.value;
                if (v && !/[\d.]/.test(v)) setBarcode((b) => ({ ...b, encoded: { ...b.encoded, separator: v } }));
              }}
            />
          </Row>
        )}

        <Row label="Weight-embedded numeric codes" detail="Prefix + item code + weight, e.g. in-store EAN-13 labels">
          <Toggle
            label="Weight-embedded numeric codes"
            checked={settings.barcode.numeric.enabled}
            onChange={(enabled) => setBarcode((b) => ({ ...b, numeric: { ...b.numeric, enabled } }))}
          />
        </Row>
        {settings.barcode.numeric.enabled && <NumericFormat value={settings.barcode.numeric} onChange={(numeric) => setBarcode((b) => ({ ...b, numeric }))} />}

        <CodeTester settings={settings.barcode} />
        <ActionRow label="Reset scanner settings" onClick={() => setBarcode(() => DEFAULT_SETTINGS.barcode)} subtle />
      </Section>

      <Section title="Data">
        <ActionRow icon={<UploadIcon size={18} />} label="Import from Excel" detail=".xlsx or .csv" onClick={() => setImporting(true)} />
        <ActionRow
          icon={<DownloadIcon size={18} />}
          label="Download Excel template"
          onClick={() => makeFile(downloadInventoryTemplate, 'Template downloaded')}
        />
        <ActionRow
          icon={<DownloadIcon size={18} />}
          label="Export items to Excel"
          detail={`${items.length} items`}
          onClick={() => makeFile(() => exportInventoryWorkbook(items), `Exported ${items.length} items`)}
        />
        <ActionRow icon={<DownloadIcon size={18} />} label="Backup (JSON)" detail="Full copy" onClick={backupItems} subtle />
        <ActionRow icon={<UploadIcon size={18} />} label="Restore backup" detail="JSON" onClick={() => fileRef.current?.click()} subtle />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restoreItems(f);
            e.target.value = '';
          }}
        />
        {demoCount > 0 && (
          <ActionRow icon={<TrashIcon size={18} />} label="Remove demo items" detail={`${demoCount} demo items`} onClick={() => setConfirm('demo')} />
        )}
        <ActionRow icon={<TrashIcon size={18} />} label="Clear local data" detail="Deletes all saved items" danger onClick={() => setConfirm('clear')} />
      </Section>

      <Section title="About">
        <div className="flex items-center gap-4 py-4">
          <LogoMark size={40} />
          <div>
            <div className="font-display text-xl font-medium">GoldCalc</div>
            <div className="text-xs text-muted">Version {__APP_VERSION__} · Gold &amp; Silver Calculator</div>
          </div>
        </div>
        <p className="pb-4 text-xs leading-relaxed text-muted">
          Values are estimates of metal content only, based on international spot prices converted to INR. They exclude making
          charges, GST, wastage, stones and dealer margins. Prices by{' '}
          <a className="text-champagne underline-offset-2 hover:underline" href={provider.homepage} target="_blank" rel="noreferrer">
            {new URL(provider.homepage).host}
          </a>
          .
        </p>
      </Section>

      <InventoryImport open={importing} onClose={() => setImporting(false)} />

      <ConfirmSheet
        open={confirm === 'clear'}
        title="Clear all local data?"
        body={`All ${items.length} saved items will be permanently removed from this device. Export first if you need a backup.`}
        confirmLabel="Clear data"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          itemsRepo.clearAll();
          setConfirm(null);
          toast('Local data cleared');
        }}
      />
      <ConfirmSheet
        open={confirm === 'demo'}
        title="Remove demo items?"
        body="The three sample items will be deleted. Your own items stay."
        confirmLabel="Remove"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const n = itemsRepo.removeDemo();
          setConfirm(null);
          toast(`Removed ${n} demo item${n === 1 ? '' : 's'}`);
        }}
      />
    </Page>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="eyebrow mb-2 px-1">{title}</h2>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface/50 px-4">{children}</div>
    </section>
  );
}

function Row({ label, detail, children, nested }: { label: string; detail?: ReactNode; children?: ReactNode; nested?: boolean }) {
  return (
    <div className={`flex min-h-15 items-center justify-between gap-4 py-3 ${nested ? 'pl-4' : ''}`}>
      <div className="min-w-0">
        <div className="text-[0.92rem] font-medium text-ink">{label}</div>
        {detail && <div className="mt-0.5 text-xs leading-snug text-muted">{detail}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  detail,
  onClick,
  danger,
  subtle,
}: {
  icon?: ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
  danger?: boolean;
  subtle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable flex min-h-14 w-full cursor-pointer items-center gap-3 py-3 text-left ${
        danger ? 'text-danger' : subtle ? 'text-muted hover:text-ink' : 'text-champagne hover:text-gold'
      }`}
    >
      {icon}
      <span className="flex-1 text-[0.92rem] font-medium">{label}</span>
      {detail && <span className="text-xs text-muted">{detail}</span>}
    </button>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 py-px text-[0.7rem] text-champagne">{children}</code>;
}

function ProviderSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  if (PRICE_PROVIDERS.length < 2) return <span className="text-sm font-medium text-ink">{new URL(PRICE_PROVIDERS[0]!.homepage).host}</span>;
  return (
    <select aria-label="Price source" className="field h-11 w-40 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      {PRICE_PROVIDERS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

function NumericFormat({ value, onChange }: { value: BarcodeSettings['numeric']; onChange: (v: BarcodeSettings['numeric']) => void }) {
  const num = (k: 'itemCodeLength' | 'weightLength' | 'weightDecimals', label: string, min: number, max: number) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted uppercase">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        className="field num h-11 text-center text-sm"
        value={value[k]}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value));
          if (n >= min && n <= max) onChange({ ...value, [k]: n });
        }}
      />
    </label>
  );
  const length = value.prefix.length + value.itemCodeLength + value.weightLength + (value.hasCheckDigit ? 1 : 0);
  const example =
    value.prefix +
    '1'.padStart(value.itemCodeLength, '0') +
    String(Math.round(8.42 * 10 ** value.weightDecimals)).padStart(value.weightLength, '0').slice(-value.weightLength) +
    (value.hasCheckDigit ? 'C' : '');
  return (
    <div className="space-y-3 py-4 pl-4">
      <div className="grid grid-cols-4 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted uppercase">Prefix</span>
          <input
            inputMode="numeric"
            className="field num h-11 text-center text-sm"
            value={value.prefix}
            maxLength={3}
            onChange={(e) => onChange({ ...value, prefix: e.target.value.replace(/\D/g, '') })}
          />
        </label>
        {num('itemCodeLength', 'Item', 1, 8)}
        {num('weightLength', 'Weight', 2, 7)}
        {num('weightDecimals', 'Decimals', 0, 3)}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink">Ends with check digit</span>
        <Toggle label="Ends with check digit" checked={value.hasCheckDigit} onChange={(hasCheckDigit) => onChange({ ...value, hasCheckDigit })} />
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {length}-digit codes, e.g. <Code>{example}</Code> → item <Code>{'1'.padStart(value.itemCodeLength, '0')}</Code>, 8.42 g. Metal and purity come
        from the saved item whose barcode is the item code.
      </p>
    </div>
  );
}

function CodeTester({ settings }: { settings: BarcodeSettings }) {
  const [code, setCode] = useState('');
  const r = code.trim() ? resolveBarcode(code, settings, itemsRepo) : null;
  return (
    <div className="py-4">
      <label htmlFor="tester" className="text-[0.92rem] font-medium text-ink">
        Test a barcode
      </label>
      <input
        id="tester"
        className="field num mt-2 h-11 text-sm tracking-wider"
        placeholder="Paste or type a code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
      {r && (
        <p className={`mt-2 text-xs ${r.status === 'found' ? 'text-live' : 'text-warn'}`} role="status">
          {r.status === 'found'
            ? `${r.item.source === 'database' ? 'Saved item' : 'Decoded'}: ${metalLabel(r.item.metal)} ${r.item.purity} · ${formatGrams(r.item.weightGrams)}`
            : `Not resolved${r.hint?.weightGrams ? ` — weight ${formatGrams(r.hint.weightGrams)}, item code ${r.barcode} not saved` : ''}`}
        </p>
      )}
    </div>
  );
}

function AdjustmentInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    const valid = text.trim() !== '' && Number.isFinite(n) && n >= -20 && n <= 30;
    const next = valid ? Math.round(n * 100) / 100 : value;
    setText(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="relative w-24">
      <input
        inputMode="decimal"
        aria-label="Market adjustment percent"
        className="field num h-11 pr-8 text-right text-sm"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d.,-]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
    </div>
  );
}
