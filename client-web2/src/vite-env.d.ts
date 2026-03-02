/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPERIS_API_URL?: string;
  readonly VITE_GATEWAY_URL?: string;
  readonly VITE_GATEWAY_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
