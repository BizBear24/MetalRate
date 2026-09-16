import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSettings } from '@/types';
import { loadSettings, saveSettings } from '@/services/storage/settingsRepo';

interface SettingsCtx {
  settings: AppSettings;
  update: (patch: (s: AppSettings) => AppSettings) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const update = useCallback((fn: (s: AppSettings) => AppSettings) => {
    setSettings((prev) => {
      const next = fn(prev);
      saveSettings(next);
      return next;
    });
  }, []);

  useApplyTheme(settings.theme);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used inside SettingsProvider');
  return v;
}

function useApplyTheme(pref: AppSettings['theme']) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const theme = pref === 'system' ? (mq.matches ? 'light' : 'dark') : pref;
      document.documentElement.dataset.theme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'light' ? '#F6F2E9' : '#080806');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}
