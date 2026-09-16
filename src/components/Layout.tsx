import type { ReactNode } from 'react';
import { navigate, useRoute, goBack } from '@/lib/router';
import { BackIcon, HomeIcon, ItemsIcon, SettingsIcon } from './Icons';
import { IconButton } from './Button';

const TABS = [
  { path: '/', label: 'Home', Icon: HomeIcon },
  { path: '/items', label: 'Items', Icon: ItemsIcon },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

export function BottomNav() {
  const { path } = useRoute();
  return (
    <nav
      aria-label="Main"
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line pb-safe sm:bottom-4 sm:left-1/2 sm:w-[360px] sm:-translate-x-1/2 sm:rounded-full sm:border sm:pb-0"
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch justify-around px-4 sm:h-14">
        {TABS.map(({ path: p, label, Icon }) => {
          const active = p === '/' ? path === '/' : path.startsWith(p);
          return (
            <li key={p} className="flex flex-1">
              <button
                type="button"
                onClick={() => navigate(p, { replace: active })}
                aria-current={active ? 'page' : undefined}
                className={`pressable relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[0.65rem] font-semibold tracking-[0.12em] uppercase sm:flex-row sm:gap-2 ${
                  active ? 'text-gold' : 'text-faint hover:text-muted'
                }`}
              >
                <Icon size={21} strokeWidth={active ? 1.8 : 1.5} />
                {label}
                {active && <span className="absolute top-0 h-px w-8 bg-gold sm:hidden" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Page container: constrained width, room for the bottom nav. */
export function Page({ children, nav = true, className = '' }: { children: ReactNode; nav?: boolean; className?: string }) {
  return (
    <main
      className={`animate-page relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:max-w-lg sm:px-6 sm:pt-10 ${
        nav ? 'pb-[calc(env(safe-area-inset-bottom)+6rem)]' : 'pb-[calc(env(safe-area-inset-bottom)+1.5rem)]'
      } ${className}`}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  eyebrow,
  back,
  backFallback = '/',
  action,
}: {
  title: string;
  eyebrow?: string;
  back?: boolean;
  backFallback?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex min-h-11 items-center gap-2">
      {back && (
        <IconButton label="Back" onClick={() => goBack(backFallback)} className="-ml-3">
          <BackIcon />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="truncate font-display text-[1.9rem] leading-none font-medium text-ink">{title}</h1>
      </div>
      {action}
    </header>
  );
}
