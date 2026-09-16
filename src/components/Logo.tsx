import { useId } from 'react';

/** GC monogram: an open outer ring (C) enclosing a smaller ring with a crossbar (G). */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--gold-hi)" />
          <stop offset="0.55" stopColor="var(--gold)" />
          <stop offset="1" stopColor="var(--gold-lo)" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${id}g)`} strokeLinecap="round">
        <path d="M31.31 8.69A16 16 0 1 0 31.31 31.31" strokeWidth="2.4" />
        <path d="M25.66 14.34A8 8 0 1 0 28 20h-6.5" strokeWidth="2.4" />
      </g>
      <circle cx="33.4" cy="20" r="1.3" fill="var(--gold)" />
    </svg>
  );
}

export function Wordmark({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={34} />
      <div className="leading-none">
        <div className="font-display text-[1.7rem] font-medium tracking-[0.01em] text-ink">
          Gold<span className="gold-text">Calc</span>
        </div>
        {subtitle && <div className="eyebrow mt-1.5 !text-[0.6rem] !tracking-[0.22em]">Live Gold &amp; Silver Value</div>}
      </div>
    </div>
  );
}
