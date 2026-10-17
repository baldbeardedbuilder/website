/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  /** Server only. Bypasses row level security, so it must never be prefixed PUBLIC_. */
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Server only. HMAC key for the hashed IP that dedupes anonymous likes. */
  readonly LIKE_IP_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
