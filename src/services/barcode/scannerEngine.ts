/**
 * Camera + decoder. Uses the native BarcodeDetector where available and lazily
 * loads ZXing otherwise. Knows nothing about items or prices.
 */

export type ScannerErrorKind = 'denied' | 'no-camera' | 'insecure' | 'unsupported' | 'unknown';

export class ScannerError extends Error {
  constructor(
    public kind: ScannerErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export interface ScannerSession {
  stop(): void;
  /** Present only when the active camera exposes a controllable torch. */
  setTorch?: (on: boolean) => Promise<void>;
  engine: 'native' | 'zxing';
}

const NATIVE_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93',
  'itf', 'codabar', 'qr_code', 'data_matrix', 'pdf417',
];

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorCtor {
  new (opts?: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

async function createNativeDetector(): Promise<NativeDetector | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = await Ctor.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
    // Some desktop builds expose the API but support nothing.
    if (!formats.includes('ean_13') && !formats.includes('code_128')) return null;
    return new Ctor({ formats });
  } catch {
    return null;
  }
}

async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new ScannerError('insecure', 'Camera needs a secure (HTTPS) connection.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new ScannerError('unsupported', 'This browser can’t access the camera.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
  } catch (e) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new ScannerError('denied', 'Camera access was denied.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
      throw new ScannerError('no-camera', 'No usable camera was found.');
    }
    throw new ScannerError('unknown', (e as Error)?.message || 'Could not start the camera.');
  }
}

function torchControl(stream: MediaStream): ScannerSession['setTorch'] {
  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
  if (!track || !caps?.torch) return undefined;
  return (on: boolean) =>
    track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
}

export async function startScanner(
  video: HTMLVideoElement,
  onDetect: (code: string) => void,
): Promise<ScannerSession> {
  const stream = await openCamera();
  let stopped = false;
  const stopStream = () => stream.getTracks().forEach((t) => t.stop());

  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  try {
    await video.play();
  } catch {
    /* autoplay can reject if the element was detached; the loop below still exits cleanly */
  }

  const native = await createNativeDetector();
  if (native) {
    let raf = 0;
    let busy = false;
    const tick = async () => {
      if (stopped) return;
      if (!busy && video.readyState >= 2) {
        busy = true;
        try {
          const found = await native.detect(video);
          const code = found.find((b) => b.rawValue)?.rawValue;
          if (code && !stopped) onDetect(code);
        } catch {
          /* transient decode errors are expected */
        } finally {
          busy = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      engine: 'native',
      setTorch: torchControl(stream),
      stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        stopStream();
      },
    };
  }

  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF,
    BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result && !stopped) onDetect(result.getText());
  });
  return {
    engine: 'zxing',
    setTorch: torchControl(stream),
    stop() {
      stopped = true;
      controls.stop();
      stopStream();
    },
  };
}

/**
 * On browsers without a native detector, fetch the ZXing fallback while idle so the
 * service worker caches it and scanning still works offline later.
 */
export function prewarmScanner(): void {
  if ('BarcodeDetector' in globalThis) return;
  const load = () => void Promise.all([import('@zxing/browser'), import('@zxing/library')]).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 5000 });
  else setTimeout(load, 3000);
}
