import { useEffect, useRef, type ReactNode } from 'react';

/** Bottom sheet on phones, centered dialog on larger screens. Esc / backdrop closes. */
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="animate-fade absolute inset-0 bg-[var(--scrim)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="animate-sheet relative w-full max-w-md rounded-t-[28px] border border-line-strong bg-elev px-6 pt-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/40 sm:m-4 sm:rounded-[28px] sm:pb-6"
      >
        <div className="absolute top-2.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong sm:hidden" />
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="confirm-title">
      <h2 id="confirm-title" className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className="pressable h-12 cursor-pointer rounded-xl border border-line-strong font-medium text-ink">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="pressable h-12 cursor-pointer rounded-xl bg-danger/90 font-semibold text-white hover:bg-danger"
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
