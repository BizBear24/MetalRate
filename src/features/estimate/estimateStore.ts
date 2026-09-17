import type { GstMode } from '@/types';
import { readJSON, writeJSON } from '@/lib/storage';

export type DocKind = 'estimate' | 'bill';
export type PaymentMode = '' | 'Cash' | 'UPI' | 'Card' | 'Bank transfer' | 'Old gold exchange';

/**
 * The estimate / bill being prepared. Lines are scanned codes, valued at the current
 * price until printed. The same items can be printed as an estimate and then as a bill.
 */
export interface EstimateDraft {
  kind: DocKind;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  /** Bill only. */
  customerAddress: string;
  customerGstin: string;
  gstMode: GstMode;
  paymentMode: PaymentMode;
  codes: string[];
  /** Numbers assigned when each kind was first printed. */
  printed: Partial<Record<DocKind, string>>;
}

const DRAFT_KEY = 'estimate-draft';
const SEQ_KEYS: Record<DocKind, string> = { estimate: 'estimate-seq', bill: 'bill-seq' };
const PREFIX: Record<DocKind, string> = { estimate: 'EST', bill: 'INV' };

type Listener = () => void;
const listeners = new Set<Listener>();

export function formatNumber(kind: DocKind, seq: number): string {
  return `${PREFIX[kind]}-${String(seq).padStart(4, '0')}`;
}

const lastSeq = (kind: DocKind) => readJSON<number>(SEQ_KEYS[kind], 0);

function blank(gstMode: GstMode = 'intra', kind: DocKind = 'estimate'): EstimateDraft {
  return {
    kind,
    createdAt: new Date().toISOString(),
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerGstin: '',
    gstMode,
    paymentMode: '',
    codes: [],
    printed: {},
  };
}

function load(): EstimateDraft {
  const saved = readJSON<Partial<EstimateDraft> & { number?: string } | null>(DRAFT_KEY, null);
  if (!saved) return blank();
  // Drafts saved before bills existed carried a single `number`.
  const { number: _legacy, ...rest } = saved;
  return { ...blank(), ...rest, printed: rest.printed ?? {} };
}

let draft: EstimateDraft = load();

function commit(next: EstimateDraft) {
  draft = next;
  writeJSON(DRAFT_KEY, draft);
  listeners.forEach((l) => l());
}

export const estimateStore = {
  get: () => draft,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** The number shown for the current kind: the assigned one once printed, else the next free one. */
  numberFor(d: EstimateDraft = draft): string {
    return d.printed[d.kind] ?? formatNumber(d.kind, lastSeq(d.kind) + 1);
  },

  /** Reserves the document number (first print only) and returns it. */
  markPrinted(): string {
    const existing = draft.printed[draft.kind];
    if (existing) return existing;
    const seq = lastSeq(draft.kind) + 1;
    writeJSON(SEQ_KEYS[draft.kind], seq);
    const number = formatNumber(draft.kind, seq);
    commit({ ...draft, printed: { ...draft.printed, [draft.kind]: number } });
    return number;
  },

  /** Returns false when the code is already on the document. */
  add(code: string): boolean {
    const c = code.trim();
    if (!c || draft.codes.includes(c)) return false;
    commit({ ...draft, codes: [...draft.codes, c], createdAt: draft.codes.length ? draft.createdAt : new Date().toISOString() });
    return true;
  },
  remove(code: string) {
    commit({ ...draft, codes: draft.codes.filter((c) => c !== code) });
  },
  update(
    patch: Partial<
      Pick<EstimateDraft, 'kind' | 'customerName' | 'customerPhone' | 'customerAddress' | 'customerGstin' | 'gstMode' | 'paymentMode'>
    >,
  ) {
    commit({ ...draft, ...patch });
  },
  /** Starts a new, empty document of the same kind. */
  reset(defaultGstMode: GstMode = 'intra') {
    commit(blank(defaultGstMode, draft.kind));
  },
};
