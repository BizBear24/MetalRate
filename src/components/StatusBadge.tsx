import type { PriceStatus } from '@/types';

const META: Record<PriceStatus, { label: string; tone: string; pulse?: boolean }> = {
  live: { label: 'Live', tone: 'text-live', pulse: true },
  delayed: { label: 'Delayed', tone: 'text-warn' },
  offline: { label: 'Offline', tone: 'text-danger' },
  loading: { label: 'Updating', tone: 'text-muted' },
  unavailable: { label: 'Unavailable', tone: 'text-danger' },
};

export function StatusBadge({ status, prefix, className = '' }: { status: PriceStatus; prefix?: string; className?: string }) {
  const m = META[status];
  return (
    <span className={`inline-flex items-center gap-2 text-[0.66rem] font-semibold tracking-[0.18em] uppercase ${m.tone} ${className}`}>
      <span className={`size-1.5 rounded-full bg-current ${m.pulse ? 'animate-live' : ''} ${status === 'loading' ? 'animate-pulse' : ''}`} />
      {prefix ? `${m.label} ${prefix}` : m.label}
    </span>
  );
}

export function statusLabel(status: PriceStatus): string {
  return META[status].label;
}
