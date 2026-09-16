/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(({ mode }) => {
  // Non-VITE_ variables are never bundled into client code.
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.PRICE_API_BASE_URL;
  const proxyKey = env.PRICE_API_KEY;

  const proxy = proxyTarget
    ? {
        '/api/price': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api\/price/, ''),
          headers: proxyKey ? { 'x-api-key': proxyKey } : undefined,
        },
      }
    : undefined;

  return {
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: true,
      // Optional keyed-provider proxy: the browser calls /api/price/*, the dev
      // server forwards it and attaches the secret key server-side.
      proxy,
    },
    preview: { host: true, proxy },
    test: { environment: 'node' },
  };
});
