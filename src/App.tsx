import { useEffect } from 'react';
import { useRoute } from '@/lib/router';
import { useSettings } from '@/hooks/useSettings';
import { usePricePolling } from '@/features/pricing/usePrices';
import { BottomNav } from '@/components/Layout';
import { HomePage } from '@/pages/HomePage';
import { ScanPage } from '@/pages/ScanPage';
import { ResultPage } from '@/pages/ResultPage';
import { ItemsPage } from '@/pages/ItemsPage';
import { ItemFormPage } from '@/pages/ItemFormPage';
import { SettingsPage } from '@/pages/SettingsPage';

export function App() {
  const { path, params } = useRoute();
  const { settings } = useSettings();
  usePricePolling(settings.priceProviderId);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path, params]);

  const editMatch = path.match(/^\/items\/([^/]+)\/edit$/);
  let page;
  let nav = true;
  if (path === '/scan') {
    page = <ScanPage />;
    nav = false;
  } else if (path === '/result') {
    page = <ResultPage key={params.get('code')} />;
    nav = false;
  } else if (path === '/items') page = <ItemsPage />;
  else if (path === '/items/new') page = <ItemFormPage key={params.toString()} />;
  else if (editMatch) page = <ItemFormPage key={editMatch[1]} id={editMatch[1]} />;
  else if (path === '/settings') page = <SettingsPage />;
  else page = <HomePage />;

  return (
    <>
      <div key={path} className="contents">
        {page}
      </div>
      {nav && <BottomNav />}
    </>
  );
}
