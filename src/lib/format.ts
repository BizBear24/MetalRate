const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const grams = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

/** ₹1,25,430 — Indian digit grouping. */
export function formatINR(value: number): string {
  return `₹${inr0.format(Math.round(value))}`;
}

const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Per-gram rate: whole rupees at ₹1,000+, otherwise two decimals (₹195.32). */
export function formatRate(value: number): string {
  return value >= 1000 ? formatINR(value) : `₹${inr2.format(value)}`;
}

export function formatGrams(value: number): string {
  return `${grams.format(value)} g`;
}

export function maskBarcode(code: string): string {
  if (code.length <= 4) return code;
  return `••••${code.slice(-4)}`;
}

/** "just now", "42 sec ago", "12 min ago", "3 hr ago", "2 days ago". */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (Number.isNaN(diff)) return '—';
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff} sec ago`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
