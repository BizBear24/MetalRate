import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertIcon, CheckIcon } from './Icons';

type Tone = 'success' | 'error';
interface ToastMsg {
  id: number;
  text: string;
  tone: Tone;
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seq = useRef(0);

  const show = useCallback((text: string, tone: Tone = 'success') => {
    clearTimeout(timer.current);
    setToast({ id: ++seq.current, text, tone });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] pt-safe">
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="glass animate-toast absolute top-4 left-1/2 flex max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full border border-line-strong py-2.5 pr-5 pl-3 text-sm font-medium text-ink shadow-2xl shadow-black/30"
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                toast.tone === 'success' ? 'bg-gold text-on-gold' : 'bg-danger/15 text-danger'
              }`}
            >
              {toast.tone === 'success' ? <CheckIcon size={14} strokeWidth={2.2} /> : <AlertIcon size={14} />}
            </span>
            <span className="truncate">{toast.text}</span>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
