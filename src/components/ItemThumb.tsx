import type { Metal } from '@/types';
import { usePhoto } from '@/hooks/usePhoto';

/** Item photo when one exists, otherwise a quiet Au / Ag monogram. */
export function ItemThumb({
  itemId,
  hasPhoto,
  metal,
  size = 40,
  className = '',
}: {
  itemId?: string;
  hasPhoto?: boolean;
  metal: Metal;
  size?: number;
  className?: string;
}) {
  const url = usePhoto(itemId, !!hasPhoto);
  const box = { width: size, height: size };

  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={box}
        className={`shrink-0 rounded-full border border-line-strong object-cover ${className}`}
        draggable={false}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={box}
      className={`flex shrink-0 items-center justify-center rounded-full border text-[0.62rem] font-bold tracking-wider ${
        metal === 'gold' ? 'border-gold/40 text-gold' : 'border-line-strong text-muted'
      } ${className}`}
    >
      {metal === 'gold' ? 'Au' : 'Ag'}
    </span>
  );
}
