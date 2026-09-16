import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` so relative times ("42 sec ago") stay current. */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
