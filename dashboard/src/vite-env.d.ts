/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_METRICS_API_URL: string
  readonly VITE_ADMIN_USERNAME: string
  readonly VITE_ADMIN_PASSWORD: string
  readonly VITE_JWT_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
