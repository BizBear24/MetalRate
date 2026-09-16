import { useSyncExternalStore } from 'react';

/** Minimal hash router — keeps back-button behaviour and works on any static host. */
export interface Route {
  path: string;
  params: URLSearchParams;
  /** Position in this app's history stack (0 = entry page). */
  index: number;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  const index = (history.state as { idx?: number } | null)?.idx ?? 0;
  return { path, params: new URLSearchParams(query), index };
}

let current = parse();
const listeners = new Set<() => void>();
const emit = () => {
  current = parse();
  listeners.forEach((l) => l());
};
window.addEventListener('popstate', emit);
window.addEventListener('hashchange', emit);

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function navigate(
  path: string,
  opts: { replace?: boolean; params?: Record<string, string | undefined> } = {},
) {
  const qs = new URLSearchParams();
  Object.entries(opts.params ?? {}).forEach(([k, v]) => v != null && v !== '' && qs.set(k, v));
  const url = `#${path}${qs.size ? `?${qs}` : ''}`;
  if (opts.replace) history.replaceState({ idx: current.index }, '', url);
  else history.pushState({ idx: current.index + 1 }, '', url);
  emit();
}

/** Go back within the app, or to `fallback` when this page was opened directly. */
export function goBack(fallback = '/') {
  if (current.index > 0) history.back();
  else navigate(fallback, { replace: true });
}
