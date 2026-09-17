import { useEffect, useState } from 'react';
import { photoStore } from '@/services/storage/photoStore';

/** Display URL for an item's photo, or undefined. Pass `enabled=false` to skip the lookup. */
export function usePhoto(itemId: string | undefined, enabled = true): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!itemId || !enabled) {
      setUrl(undefined);
      return;
    }
    let active = true;
    const load = () => void photoStore.url(itemId).then((u) => active && setUrl(u));
    load();
    const unsub = photoStore.subscribe((id) => id === itemId && load());
    return () => {
      active = false;
      unsub();
    };
  }, [itemId, enabled]);

  return url;
}
