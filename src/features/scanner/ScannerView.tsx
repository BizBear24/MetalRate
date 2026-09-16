import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { startScanner, ScannerError, type ScannerErrorKind, type ScannerSession } from '@/services/barcode/scannerEngine';
import { CameraIcon, CloseIcon, FlashIcon, KeyboardIcon } from '@/components/Icons';
import { Button, IconButton } from '@/components/Button';
import { Sheet } from '@/components/Sheet';

type Phase = 'starting' | 'scanning' | { error: ScannerErrorKind };

const ERROR_COPY: Record<ScannerErrorKind, { title: string; body: string }> = {
  denied: { title: 'Camera access required', body: 'Allow camera access to scan barcodes.' },
  'no-camera': { title: 'No camera found', body: 'Connect a camera, or enter the barcode manually.' },
  insecure: { title: 'Secure connection needed', body: 'Open GoldCalc over HTTPS to use the camera.' },
  unsupported: { title: 'Camera not supported', body: 'This browser can’t scan. Enter the barcode manually.' },
  unknown: { title: 'Camera unavailable', body: 'Something stopped the camera from starting.' },
};

interface Props {
  title?: string;
  /** Called once per detected code. Detection is ignored while `paused`. */
  onDetect: (code: string) => void;
  onClose: () => void;
  paused?: boolean;
  /** Rendered above the viewport (e.g. success animation, not-found sheet). */
  children?: ReactNode;
}

export function ScannerView({ title = 'Scan item barcode', onDetect, onClose, paused = false, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<ScannerSession | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [attempt, setAttempt] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);

  // Latest-value refs so the camera loop never needs restarting.
  const pausedRef = useRef(paused);
  const detectRef = useRef(onDetect);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  pausedRef.current = paused || manualOpen;
  detectRef.current = onDetect;

  useEffect(() => {
    // After resuming, briefly ignore the code that was just handled.
    if (!paused && lastRef.current) lastRef.current.at = Date.now();
  }, [paused]);

  const handle = useCallback((code: string) => {
    if (pausedRef.current) return;
    const last = lastRef.current;
    if (last && last.code === code && Date.now() - last.at < 1800) return;
    lastRef.current = { code, at: Date.now() };
    navigator.vibrate?.(40);
    detectRef.current(code);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;
    setPhase('starting');
    startScanner(video, handle)
      .then((s) => {
        if (cancelled) return s.stop();
        sessionRef.current = s;
        setTorch({ supported: !!s.setTorch, on: false });
        setPhase('scanning');
      })
      .catch((e) => {
        if (cancelled) return;
        setPhase({ error: e instanceof ScannerError ? e.kind : 'unknown' });
      });
    return () => {
      cancelled = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, [attempt, handle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !manualOpen && !paused) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, manualOpen, paused]);

  const toggleTorch = async () => {
    const next = !torch.on;
    try {
      await sessionRef.current?.setTorch?.(next);
      setTorch((t) => ({ ...t, on: next }));
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const error = typeof phase === 'object' ? ERROR_COPY[phase.error] : null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white" role="dialog" aria-modal="true" aria-label={title}>
      <video
        ref={videoRef}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${phase === 'scanning' ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        muted
      />

      {/* Frame + mask */}
      {!error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative aspect-[1.55] w-[min(82vw,380px)] rounded-[26px] shadow-[0_0_0_100vmax_rgb(0_0_0/0.62)]">
            <Corners />
            {phase === 'scanning' && !paused && (
              <div className="animate-scan absolute inset-x-5 h-[2px] rounded-full bg-[linear-gradient(90deg,transparent,#f0dca8,#d2b06a,#f0dca8,transparent)] shadow-[0_0_18px_3px_rgb(210_176_106/0.55)]" />
            )}
            {phase === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="size-7 animate-spin rounded-full border-2 border-white/15 border-t-[#d2b06a]" aria-label="Starting camera" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-8">
        <IconButton label="Close scanner" onClick={onClose} className="!text-white/85 hover:!bg-white/10">
          <CloseIcon />
        </IconButton>
        <span className="text-[0.66rem] font-semibold tracking-[0.24em] text-[#d8c6a0] uppercase">GoldCalc</span>
        {torch.supported ? (
          <IconButton
            label={torch.on ? 'Turn off flashlight' : 'Turn on flashlight'}
            onClick={toggleTorch}
            className={torch.on ? '!bg-[#d2b06a] !text-black' : '!text-white/85 hover:!bg-white/10'}
          >
            <FlashIcon />
          </IconButton>
        ) : (
          <span className="size-11" />
        )}
      </div>

      {/* Bottom copy */}
      {!error && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black/80 via-black/50 to-transparent px-6 pt-16 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] text-center">
          <h2 className="font-display text-[1.65rem] leading-tight font-medium">{title}</h2>
          <p className="mt-1.5 text-sm text-white/55">Position the barcode inside the frame</p>
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="pressable mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-medium text-white/80 hover:border-[#d2b06a]/60 hover:text-white"
          >
            <KeyboardIcon size={18} /> Enter code manually
          </button>
        </div>
      )}

      {error && (
        <div className="animate-page absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <div className="mb-6 flex size-16 items-center justify-center rounded-full border border-[#d2b06a]/30 text-[#d2b06a]">
            <CameraIcon size={28} />
          </div>
          <h2 className="font-display text-[1.8rem] leading-tight font-medium">{error.title}</h2>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/60">{error.body}</p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <Button variant="gold" onClick={() => setAttempt((a) => a + 1)}>
              Try Again
            </Button>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="pressable h-12 cursor-pointer rounded-2xl border border-white/15 text-sm font-medium text-white/85"
            >
              Enter code manually
            </button>
          </div>
          {typeof phase === 'object' && phase.error === 'denied' && (
            <p className="mt-6 max-w-xs text-xs leading-relaxed text-white/40">
              If you blocked the camera earlier, re-enable it from the site settings in your browser’s address bar.
            </p>
          )}
        </div>
      )}

      <ManualEntry
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onSubmit={(code) => {
          setManualOpen(false);
          lastRef.current = null;
          detectRef.current(code);
        }}
      />

      {children}
    </div>
  );
}

function Corners() {
  const c = 'absolute size-9 border-[#d2b06a]';
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <span className={`${c} top-0 left-0 rounded-tl-[26px] border-t-2 border-l-2`} />
      <span className={`${c} top-0 right-0 rounded-tr-[26px] border-t-2 border-r-2`} />
      <span className={`${c} bottom-0 left-0 rounded-bl-[26px] border-b-2 border-l-2`} />
      <span className={`${c} right-0 bottom-0 rounded-br-[26px] border-r-2 border-b-2`} />
    </div>
  );
}

function ManualEntry({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <Sheet open={open} onClose={onClose} labelledBy="manual-title">
      <form
        className="text-ink"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onSubmit(code.trim());
          setCode('');
        }}
      >
        <h2 id="manual-title" className="font-display text-2xl font-medium">Enter barcode</h2>
        <p className="mt-1 text-sm text-muted">Type the code printed under the barcode.</p>
        <input
          data-autofocus
          className="field num mt-5 font-medium tracking-wider"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="890000000001"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Barcode"
        />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="gold" disabled={!code.trim()}>
            Look up
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
