import { useState, type FormEvent } from 'react';
import type { Metal, Purity } from '@/types';
import { itemsRepo } from '@/services/storage/itemsRepo';
import { defaultPurity, isValidPurity, puritiesFor } from '@/features/calculator/purity';
import { ScannerView } from '@/features/scanner/ScannerView';
import { goBack, navigate, useRoute } from '@/lib/router';
import { Page, PageHeader } from '@/components/Layout';
import { Button } from '@/components/Button';
import { FieldError, FieldLabel, Segmented } from '@/components/Form';
import { ConfirmSheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { ScanIcon, TrashIcon } from '@/components/Icons';

type Errors = Partial<Record<'barcode' | 'weight' | 'purity' | 'form', string>>;

const METALS = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
] as const;

export function ItemFormPage({ id }: { id?: string }) {
  const { params } = useRoute();
  const existing = id ? itemsRepo.get(id) : undefined;
  const toast = useToast();

  const initialMetal: Metal = existing?.metal ?? (params.get('metal') === 'silver' ? 'silver' : 'gold');
  const initialPurity = existing?.purity ?? params.get('purity') ?? defaultPurity(initialMetal);

  const [barcode, setBarcode] = useState(existing?.barcode ?? params.get('barcode') ?? '');
  const [metal, setMetal] = useState<Metal>(initialMetal);
  const [purity, setPurity] = useState<Purity>(isValidPurity(initialMetal, initialPurity) ? initialPurity : defaultPurity(initialMetal));
  const [weight, setWeight] = useState(existing ? String(existing.weightGrams) : params.get('weight') ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [scanning, setScanning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (id && !existing) {
    return (
      <Page>
        <PageHeader title="Item not found" back backFallback="/items" />
        <p className="text-sm text-muted">This item may have been deleted.</p>
      </Page>
    );
  }

  const changeMetal = (m: Metal) => {
    setMetal(m);
    if (!isValidPurity(m, purity)) setPurity(defaultPurity(m));
  };

  const validate = (): { ok: true; weight: number } | { ok: false; errors: Errors } => {
    const e: Errors = {};
    if (!barcode.trim()) e.barcode = 'Barcode is required.';
    const w = Number(weight.replace(',', '.'));
    if (!weight.trim() || !Number.isFinite(w) || w <= 0) e.weight = 'Please enter a weight greater than 0 grams.';
    else if (w > 100000) e.weight = 'That weight looks too large. Check the value in grams.';
    if (!isValidPurity(metal, purity)) e.purity = 'Choose a purity.';
    return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, weight: Math.round(w * 1000) / 1000 };
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const v = validate();
    if (!v.ok) {
      setErrors(v.errors);
      const first = v.errors.barcode ? 'barcode' : v.errors.weight ? 'weight' : null;
      if (first) document.getElementById(first)?.focus();
      return;
    }
    try {
      const saved = itemsRepo.save({ barcode, metal, purity, weightGrams: v.weight, name }, id);
      toast(existing ? 'Item updated' : 'Item added successfully');
      // From a scan: show the valuation next. Otherwise return to wherever we came from.
      const showResult = params.get('then') === 'result' && !(existing && existing.barcode === saved.barcode);
      if (showResult) navigate('/result', { replace: true, params: { code: params.get('code') ?? saved.barcode } });
      else goBack('/items');
    } catch (err) {
      setErrors({ form: (err as Error).message });
    }
  };

  const purityOptions = puritiesFor(metal).map((p) => ({ value: p, label: p }));

  return (
    <Page>
      <PageHeader title={existing ? 'Edit Item' : 'Add Item'} eyebrow={existing?.isDemo ? 'Demo item' : 'Item details'} back backFallback="/items" />

      <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-6">
        <div>
          <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
          <div className="flex gap-2">
            <input
              id="barcode"
              className="field num flex-1 font-medium tracking-wider"
              value={barcode}
              onChange={(e) => {
                setBarcode(e.target.value);
                setErrors((x) => ({ ...x, barcode: undefined, form: undefined }));
              }}
              placeholder="Scan or type code"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!errors.barcode}
              aria-describedby="barcode-err"
              autoFocus={!barcode && !existing}
            />
            <button
              type="button"
              onClick={() => setScanning(true)}
              aria-label="Scan barcode"
              className="pressable flex size-13 shrink-0 cursor-pointer items-center justify-center rounded-[14px] border border-line-strong bg-surface text-gold hover:border-gold/60"
            >
              <ScanIcon />
            </button>
          </div>
          <FieldError id="barcode-err">{errors.barcode}</FieldError>
        </div>

        <div>
          <FieldLabel>Metal</FieldLabel>
          <Segmented label="Metal" value={metal} options={METALS} onChange={changeMetal} />
        </div>

        <div>
          <FieldLabel>Purity</FieldLabel>
          <Segmented label="Purity" value={purity} options={purityOptions} onChange={setPurity} />
          <FieldError id="purity-err">{errors.purity}</FieldError>
        </div>

        <div>
          <FieldLabel htmlFor="weight" hint="grams">Weight</FieldLabel>
          <div className="relative">
            <input
              id="weight"
              className="field num pr-12 text-lg font-medium"
              value={weight}
              onChange={(e) => {
                setWeight(e.target.value.replace(/[^\d.,]/g, ''));
                setErrors((x) => ({ ...x, weight: undefined }));
              }}
              inputMode="decimal"
              placeholder="0.00"
              autoComplete="off"
              aria-invalid={!!errors.weight}
              aria-describedby="weight-err"
            />
            <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">g</span>
          </div>
          {errors.weight ? (
            <div id="weight-err" role="alert" className="mt-2 text-[0.8rem] leading-snug">
              <span className="font-semibold text-danger">Invalid weight. </span>
              <span className="text-danger/90">{errors.weight}</span>
            </div>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor="name" hint="optional">Item name</FieldLabel>
          <input
            id="name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Gold Ring"
            maxLength={60}
            autoComplete="off"
          />
        </div>

        {errors.form && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-danger">
            {errors.form}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <Button type="submit" variant="gold" size="lg" block>
            {existing ? 'Save Changes' : 'Save Item'}
          </Button>
          {existing && (
            <Button variant="danger" block icon={<TrashIcon size={18} />} onClick={() => setConfirmDelete(true)}>
              Delete Item
            </Button>
          )}
        </div>
      </form>

      {scanning && (
        <ScannerView
          onClose={() => setScanning(false)}
          onDetect={(code) => {
            setBarcode(code);
            setErrors((x) => ({ ...x, barcode: undefined, form: undefined }));
            setScanning(false);
          }}
        />
      )}

      <ConfirmSheet
        open={confirmDelete}
        title="Delete item?"
        body="This removes the item from this device."
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (id) itemsRepo.remove(id);
          setConfirmDelete(false);
          toast('Item deleted');
          navigate('/items', { replace: true });
        }}
      />
    </Page>
  );
}
