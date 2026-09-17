import { useEffect, useRef, useState, type RefObject } from 'react';
import { compressImage } from '@/lib/image';
import { usePhoto } from '@/hooks/usePhoto';
import { CameraIcon, CloseIcon, ImageIcon } from '@/components/Icons';

/** What should happen to the item's photo when the form is saved. */
export type PhotoChange = { kind: 'keep' } | { kind: 'set'; blob: Blob } | { kind: 'remove' };

export function PhotoField({
  itemId,
  hasPhoto,
  value,
  onChange,
}: {
  itemId?: string;
  hasPhoto?: boolean;
  value: PhotoChange;
  onChange: (v: PhotoChange) => void;
}) {
  const savedUrl = usePhoto(itemId, !!hasPhoto && value.kind === 'keep');
  const [pendingUrl, setPendingUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value.kind !== 'set') {
      setPendingUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const preview = value.kind === 'set' ? pendingUrl : value.kind === 'keep' ? savedUrl : undefined;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      onChange({ kind: 'set', blob: await compressImage(file) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input = (ref: RefObject<HTMLInputElement | null>, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(capture ? { capture: 'environment' as const } : {})}
      className="hidden"
      onChange={(e) => {
        void pick(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl border border-line-strong bg-surface">
          {preview ? (
            <img src={preview} alt="Item photo" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-faint">
              {busy ? (
                <span className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-gold" aria-label="Processing photo" />
              ) : (
                <ImageIcon size={28} />
              )}
            </div>
          )}
          {preview && (
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange({ kind: 'remove' })}
              className="pressable absolute top-1 right-1 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
            >
              <CloseIcon size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="pressable inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface/60 text-sm font-medium text-ink hover:border-gold/60"
          >
            <CameraIcon size={18} className="text-gold" /> {preview ? 'Retake photo' : 'Take photo'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="pressable inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-medium text-champagne hover:text-gold"
          >
            <ImageIcon size={18} /> Choose from gallery
          </button>
        </div>
      </div>
      {input(cameraRef, true)}
      {input(galleryRef, false)}
      {error && (
        <p role="alert" className="mt-2 text-[0.8rem] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
