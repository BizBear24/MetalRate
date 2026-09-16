import { useEffect, useRef, useState } from 'react';
import type { Resolution, ResolvedItem } from '@/types';
import { ScannerView } from '@/features/scanner/ScannerView';
import { resolveBarcode } from '@/services/barcode/resolver';
import { itemsRepo } from '@/services/storage/itemsRepo';
import { useSettings } from '@/hooks/useSettings';
import { goBack, navigate } from '@/lib/router';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/Button';
import { CheckIcon, PlusIcon, ScanIcon } from '@/components/Icons';
import { formatGrams } from '@/lib/format';
import { metalLabel } from '@/features/calculator/purity';

export function ScanPage() {
  const { settings } = useSettings();
  const [state, setState] = useState<null | { found: ResolvedItem } | { missing: Extract<Resolution, { status: 'not-found' }> }>(null);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onDetect = (code: string) => {
    const r = resolveBarcode(code, settings.barcode, itemsRepo);
    if (r.status === 'found') {
      setState({ found: r.item });
      timer.current = setTimeout(() => navigate('/result', { replace: true, params: { code } }), 850);
    } else {
      navigator.vibrate?.([30, 60, 30]);
      setState({ missing: r });
    }
  };

  const missing = state && 'missing' in state ? state.missing : null;
  const found = state && 'found' in state ? state.found : null;

  return (
    <ScannerView onDetect={onDetect} onClose={() => goBack('/')} paused={!!state}>
      {found && <FoundOverlay item={found} />}
      <Sheet open={!!missing} onClose={() => setState(null)} labelledBy="nf-title">
        {missing && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-line-strong text-champagne">
              <ScanIcon size={24} />
            </div>
            <h2 id="nf-title" className="font-display text-[1.75rem] leading-tight font-medium text-ink">
              Item not found
            </h2>
            <p className="mt-1.5 text-sm text-muted">This barcode isn’t in GoldCalc yet.</p>
            <p className="num mx-auto mt-4 inline-block max-w-full truncate rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium tracking-wider text-champagne">
              {missing.barcode}
              {missing.hint?.weightGrams ? ` · ${formatGrams(missing.hint.weightGrams)}` : ''}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Button
                variant="gold"
                icon={<PlusIcon size={18} />}
                data-autofocus
                onClick={() =>
                  navigate('/items/new', {
                    replace: true,
                    params: {
                      barcode: missing.hint?.barcode ?? missing.barcode,
                      weight: missing.hint?.weightGrams?.toString(),
                      then: 'result',
                      code: missing.scannedCode,
                    },
                  })
                }
              >
                Add Item
              </Button>
              <Button onClick={() => setState(null)} icon={<ScanIcon size={18} />}>
                Scan Again
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </ScannerView>
  );
}

function FoundOverlay({ item }: { item: ResolvedItem }) {
  return (
    <div className="animate-fade absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md" role="status">
      <div className="animate-found relative flex size-24 items-center justify-center rounded-full border border-[#d2b06a]/50 shadow-[0_0_60px_rgb(210_176_106/0.35)]">
        <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle,rgb(210_176_106/0.25),transparent_70%)]" />
        <CheckIcon size={40} strokeWidth={1.8} className="animate-draw text-[#f0dca8]" />
      </div>
      <div className="mt-6 text-[0.72rem] font-semibold tracking-[0.3em] text-[#d2b06a] uppercase">Item Found</div>
      <div className="mt-2 font-display text-2xl text-white">
        {item.name || `${metalLabel(item.metal)} · ${item.purity}`}
      </div>
    </div>
  );
}
