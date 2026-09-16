import { useMemo, useState } from 'react';
import type { Item } from '@/types';
import { useItems } from '@/hooks/useItems';
import { itemsRepo } from '@/services/storage/itemsRepo';
import { formatGrams, maskBarcode } from '@/lib/format';
import { metalLabel } from '@/features/calculator/purity';
import { navigate } from '@/lib/router';
import { Page, PageHeader } from '@/components/Layout';
import { Button, IconButton } from '@/components/Button';
import { ConfirmSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { EditIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from '@/components/Icons';
import { InventoryImport } from '@/features/items/InventoryImport';

export function ItemsPage() {
  const items = useItems();
  const [q, setQ] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.barcode.toLowerCase().includes(term) ||
        i.name?.toLowerCase().includes(term) ||
        metalLabel(i.metal).toLowerCase().includes(term) ||
        i.purity.toLowerCase() === term,
    );
  }, [items, q]);

  return (
    <Page>
      <PageHeader
        eyebrow={`${items.length} saved`}
        title="Your Items"
        action={
          <div className="flex gap-2">
            <Button size="md" icon={<UploadIcon size={16} />} onClick={() => setImporting(true)}>
              <span>
                Import<span className="hidden sm:inline"> Excel</span>
              </span>
            </Button>
            <div className="hidden sm:block">
              <Button variant="gold" size="md" icon={<PlusIcon size={16} />} onClick={() => navigate('/items/new')}>
                Add Item
              </Button>
            </div>
          </div>
        }
      />

      <div className="relative">
        <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search barcode or item"
          aria-label="Search barcode or item"
          className="field pl-11"
        />
      </div>

      {items.length === 0 ? (
        <Empty onImport={() => setImporting(true)} />
      ) : filtered.length === 0 ? (
        <p className="mt-16 text-center text-sm text-muted">No items match “{q}”.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {filtered.map((item) => (
            <li key={item.id} className="group flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/result', { params: { code: item.barcode } })}
                className="pressable flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 py-4 text-left"
                aria-label={`Value ${item.name || metalLabel(item.metal)}`}
              >
                <MetalDot metal={item.metal} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{item.name || `${metalLabel(item.metal)} item`}</span>
                    {item.isDemo && (
                      <span className="shrink-0 rounded border border-line-strong px-1.5 py-px text-[0.58rem] font-bold tracking-[0.14em] text-faint uppercase">
                        Demo
                      </span>
                    )}
                  </div>
                  <div className="num mt-0.5 flex gap-2 text-[0.8rem] text-muted">
                    <span>
                      {item.purity} · {formatGrams(item.weightGrams)}
                    </span>
                    <span className="tracking-wider text-faint">{maskBarcode(item.barcode)}</span>
                  </div>
                </div>
              </button>
              <IconButton label={`Edit ${item.name || 'item'}`} onClick={() => navigate(`/items/${item.id}/edit`)} className="!size-10">
                <EditIcon size={18} />
              </IconButton>
              <IconButton
                label={`Delete ${item.name || 'item'}`}
                onClick={() => setPendingDelete(item)}
                className="-mr-2 !size-10 hover:!text-danger"
              >
                <TrashIcon size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => navigate('/items/new')}
        className="btn-gold pressable fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 inline-flex h-14 cursor-pointer items-center gap-2 rounded-full pr-6 pl-5 font-semibold sm:hidden"
      >
        <PlusIcon size={20} /> Add Item
      </button>

      <InventoryImport open={importing} onClose={() => setImporting(false)} />

      <ConfirmSheet
        open={!!pendingDelete}
        title="Delete item?"
        body={`“${pendingDelete?.name || pendingDelete?.barcode}” will be removed from this device.`}
        confirmLabel="Delete"
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) itemsRepo.remove(pendingDelete.id);
          setPendingDelete(null);
          toast('Item deleted');
        }}
      />
    </Page>
  );
}

function MetalDot({ metal }: { metal: Item['metal'] }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-10 shrink-0 items-center justify-center rounded-full border text-[0.62rem] font-bold tracking-wider ${
        metal === 'gold' ? 'border-gold/40 text-gold' : 'border-line-strong text-muted'
      }`}
    >
      {metal === 'gold' ? 'Au' : 'Ag'}
    </span>
  );
}

function Empty({ onImport }: { onImport: () => void }) {
  return (
    <div className="mt-20 flex flex-col items-center text-center">
      <div className="flex size-16 items-center justify-center rounded-full border border-line-strong text-champagne">
        <PlusIcon />
      </div>
      <p className="mt-5 font-display text-2xl">No items yet</p>
      <p className="mt-1 max-w-xs text-sm text-muted">Save an item’s barcode and weight once — scan it any time after.</p>
      <Button className="mt-6" icon={<UploadIcon size={18} />} onClick={onImport}>
        Import from Excel
      </Button>
    </div>
  );
}
