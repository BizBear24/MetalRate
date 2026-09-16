import type { ReactNode } from 'react';

export function FieldLabel({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="eyebrow">
        {children}
      </label>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-[0.8rem] leading-snug text-danger">
      {children}
    </p>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-2xl border border-line bg-surface p-1"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
        if (next) {
          onChange(next.value);
          (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
        }
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={`pressable flex-1 cursor-pointer rounded-xl font-semibold tracking-wide ${
              size === 'sm' ? 'h-9 text-xs' : 'h-11 text-sm'
            } ${active ? 'bg-gold text-on-gold shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]' : 'text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`pressable relative h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors ${
        checked ? 'border-gold bg-gold' : 'border-line-strong bg-surface-2'
      }`}
    >
      <span
        className={`absolute top-0.5 size-[22px] rounded-full shadow transition-transform duration-200 ${
          checked ? 'translate-x-[22px] bg-on-gold' : 'translate-x-0.5 bg-muted'
        }`}
      />
    </button>
  );
}
