/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRICE_API_URL?: string;
  readonly VITE_SEED_DEMO_DATA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
