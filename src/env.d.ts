/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  /** Server only. Bypasses row level security, so it must never be prefixed PUBLIC_. */
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Server only. HMAC key for the hashed IP that dedupes anonymous likes. */
  readonly LIKE_IP_SECRET?: string;
  /** Server only. Drafts the title, line and severity for a submitted dev disaster. */
  readonly AI_API_KEY?: string;
  readonly AI_API_URL?: string;
  readonly AI_MODEL?: string;
  /** Server only. Resend credential used by the production notification drain. */
  readonly RESEND_API_KEY?: string;
  readonly MAIL_FROM?: string;
  readonly MAIL_REPLY_TO?: string;
  /**
   * Delivery remains closed unless this is "true". Scope this to the Production context
   * only in Netlify - Functions never receive CONTEXT at request time, so that can't be
   * checked here and this variable's scoping is what keeps previews from sending mail.
   */
  readonly MAIL_DELIVERY_ENABLED?: string;
  /** Bearer secret shared by the scheduled function and the drain endpoint. */
  readonly NOTIFY_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
