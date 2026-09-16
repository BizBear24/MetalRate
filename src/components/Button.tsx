import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'gold' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'xl';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  gold: 'btn-gold font-semibold',
  outline: 'border border-line-strong bg-surface/60 text-ink hover:border-gold/60 font-medium',
  ghost: 'text-champagne hover:text-gold font-medium',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10 font-medium',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-13 px-5 text-[0.95rem] rounded-2xl gap-2.5',
  xl: 'h-17 px-6 text-base rounded-[22px] gap-3 tracking-[0.14em] uppercase',
};

export function Button({ variant = 'outline', size = 'lg', icon, block, className = '', children, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`pressable inline-flex cursor-pointer items-center justify-center whitespace-nowrap select-none ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`pressable inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
