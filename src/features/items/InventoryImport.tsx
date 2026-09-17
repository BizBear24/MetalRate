import { useRef, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { AlertIcon, CheckIcon, DownloadIcon, UploadIcon } from '@/components/Icons';
import { itemsRepo } from '@/services/storage/itemsRepo';
import { downloadInventoryTemplate, readInventoryFile, type ParsedInventory } from '@/services/storage/inventorySheet';

type State =
  | { step: 'pick'; busy?: boolean; error?: string }
  | { step: 'preview'; fileName: string; parsed: ParsedInventory; existing: number };

const ACCEPT = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';

/** Upload an Excel/CSV inventory, preview what will change, then import. */
export function InventoryImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<State>({ step: 'pick' });
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const close = () => {
    setState({ step: 'pick' });
    onClose();
  };

  const onFile = async (file: File) => {
    setState({ step: 'pick', busy: true });
    try {
      const parsed = await readInventoryFile(file);
      if (!parsed.items.length && !parsed.errors.length) {
        setState({ step: 'pick', error: 'That sheet has no item rows yet.' });
        return;
      }
      setState({
        step: 'preview',
        fileName: file.name,
        parsed,
        existing: itemsRepo.countExisting(parsed.items.map((i) => i.barcode)),
      });
    } catch (e) {
      setState({ step: 'pick', error: (e as Error).message });
    }
  };

  const template = async () => {
    setDownloading(true);
    try {
      await downloadInventoryTemplate();
      toast('Template downloaded');
    } catch {
      toast('Couldn’t create the template', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const confirm = () => {
    if (state.step !== 'preview') return;
    try {
      const r = itemsRepo.upsertMany(state.parsed.items);
      toast(`Imported ${r.added} new${r.updated ? `, updated ${r.updated}` : ''}`);
      close();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Sheet open={open} onClose={close} labelledBy="import-title">
      <h2 id="import-title" className="font-display text-[1.75rem] leading-tight font-medium text-ink">
        Import inventory
      </h2>

      {state.step === 'pick' ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Upload an Excel (.xlsx) or CSV file with one row per item: barcode, metal, purity and net weight, plus optional
            making, stone and diamond charges.
          </p>

          <ol className="mt-5 space-y-3 text-sm">
            <li className="flex gap-3">
              <Step n={1} />
              <div className="flex-1">
                <p className="font-medium text-ink">Download the template</p>
                <button
                  type="button"
                  onClick={template}
                  disabled={downloading}
                  className="pressable mt-1 inline-flex cursor-pointer items-center gap-1.5 font-medium text-gold hover:text-gold-hi"
                >
                  <DownloadIcon size={16} />
                  {downloading ? 'Preparing…' : 'GoldCalc-inventory-template.xlsx'}
                </button>
              </div>
            </li>
            <li className="flex gap-3">
              <Step n={2} />
              <p className="flex-1 font-medium text-ink">
                Fill the <span className="text-champagne">Inventory</span> sheet in Excel or Google Sheets
              </p>
            </li>
            <li className="flex gap-3">
              <Step n={3} />
              <p className="flex-1 font-medium text-ink">Upload it here</p>
            </li>
          </ol>

          {state.error && (
            <p role="alert" className="mt-5 flex gap-2 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-danger">
              <AlertIcon size={18} className="mt-px shrink-0" />
              {state.error}
            </p>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
          <div className="mt-6 grid gap-3">
            <Button variant="gold" block icon={<UploadIcon size={18} />} disabled={state.busy} onClick={() => fileRef.current?.click()} data-autofocus>
              {state.busy ? 'Reading file…' : 'Choose file'}
            </Button>
            <Button block onClick={close}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Preview state={state} onBack={() => setState({ step: 'pick' })} onConfirm={confirm} />
      )}
    </Sheet>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-gold/40 text-[0.7rem] font-bold text-gold">
      {n}
    </span>
  );
}

function Preview({
  state,
  onBack,
  onConfirm,
}: {
  state: Extract<State, { step: 'preview' }>;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { parsed, existing, fileName } = state;
  const count = parsed.items.length;
  const fresh = count - existing;
  const issues = [...parsed.errors.map((e) => ({ ...e, kind: 'error' as const })), ...parsed.warnings.map((w) => ({ ...w, kind: 'warn' as const }))].sort(
    (a, b) => a.row - b.row,
  );
  const shown = issues.slice(0, 50);

  return (
    <>
      <p className="mt-1.5 truncate text-sm text-muted" title={fileName}>
        {fileName}
      </p>

      <div className="mt-5 grid grid-cols-3 divide-x divide-line rounded-2xl border border-line bg-surface/60 text-center">
        <Stat label="New" value={fresh} tone="text-gold" />
        <Stat label="Updated" value={existing} tone="text-ink" />
        <Stat label="Skipped" value={parsed.errors.length} tone={parsed.errors.length ? 'text-danger' : 'text-faint'} />
      </div>

      {issues.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow mb-2">
            {parsed.errors.length ? 'Rows that will be skipped' : 'Notes'}
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-surface/40 p-3 text-[0.8rem] leading-snug">
            {shown.map((i, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="num shrink-0 font-semibold text-muted">Row {i.row}</span>
                <span className={i.kind === 'error' ? 'text-danger' : 'text-warn'}>{i.message}</span>
              </li>
            ))}
            {issues.length > shown.length && <li className="text-muted">…and {issues.length - shown.length} more</li>}
          </ul>
          {parsed.errors.length > 0 && (
            <p className="mt-2 text-xs text-muted">Fix these rows in your sheet and upload again, or import the valid rows now.</p>
          )}
        </div>
      )}

      {count === 0 ? (
        <p className="mt-4 text-sm text-danger">No valid rows to import.</p>
      ) : (
        existing > 0 && (
          <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
            <CheckIcon size={16} className="shrink-0 text-gold" />
            Items with a barcode already in GoldCalc will be updated with the sheet’s values.
          </p>
        )
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button onClick={onBack}>Choose another</Button>
        <Button variant="gold" disabled={count === 0} onClick={onConfirm} data-autofocus>
          Import {count}
        </Button>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-2 py-3.5">
      <div className={`num text-2xl font-light ${tone}`}>{value.toLocaleString('en-IN')}</div>
      <div className="eyebrow mt-0.5 !text-[0.6rem]">{label}</div>
    </div>
  );
}
