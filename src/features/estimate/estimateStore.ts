import { readJSON, writeJSON } from '@/lib/storage';

/** The estimate being prepared. Lines are scanned codes, valued at the current price until printed. */
export interface EstimateDraft {
  number: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  codes: string[];
}

const DRAFT_KEY = 'estimate-draft';
/** Last estimate number that was used (i.e. had items when a new estimate was started). */
const SEQ_KEY = 'estimate-seq';

type Listener = () => void;
const listeners = new Set<Listener>();

export function formatNumber(seq: number): string {
  return `EST-${String(seq).padStart(4, '0')}`;
}

function blank(): EstimateDraft {
  return {
    number: formatNumber(readJSON<number>(SEQ_KEY, 0) + 1),
    createdAt: new Date().toISOString(),
    customerName: '',
    customerPhone: '',
    codes: [],
  };
}

let draft: EstimateDraft = readJSON<EstimateDraft | null>(DRAFT_KEY, null) ?? blank();

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
  /** Returns false when the code is already on the estimate. */
  add(code: string): boolean {
    const c = code.trim();
    if (!c || draft.codes.includes(c)) return false;
    // Date the estimate from its first item.
    commit({ ...draft, codes: [...draft.codes, c], createdAt: draft.codes.length ? draft.createdAt : new Date().toISOString() });
    return true;
  },
  remove(code: string) {
    commit({ ...draft, codes: draft.codes.filter((c) => c !== code) });
  },
  setCustomer(patch: Partial<Pick<EstimateDraft, 'customerName' | 'customerPhone'>>) {
    commit({ ...draft, ...patch });
  },
  /** Starts a new, empty estimate. The current number is consumed if it had items. */
  reset() {
    if (draft.codes.length) {
      const used = Number(draft.number.replace(/\D/g, '')) || 0;
      writeJSON(SEQ_KEY, Math.max(used, readJSON<number>(SEQ_KEY, 0)));
    }
    commit(blank());
  },
};
