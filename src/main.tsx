import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { SettingsProvider } from './hooks/useSettings';
import { ToastProvider } from './components/Toast';
import { prewarmScanner } from './services/barcode/scannerEngine';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </SettingsProvider>
  </StrictMode>,
);

// Offline app shell. Only in production builds so dev HMR isn't cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(prewarmScanner)
      .catch(() => {
      /* offline support is best-effort */
    });
  });
}
