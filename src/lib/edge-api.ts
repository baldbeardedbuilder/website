const SUPABASE_URL = import.meta.env?.PUBLIC_SUPABASE_URL;
const ANON_KEY = import.meta.env?.PUBLIC_SUPABASE_ANON_KEY;

export type EdgeFunctionName = 'like' | 'comments' | 'share';

export function edgeFunctionUrl(name: EdgeFunctionName): string | null {
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/${name}`;
}

export function edgeApiConfigured(): boolean {
  return Boolean(SUPABASE_URL && ANON_KEY);
}

export function edgeHeaders(): Record<string, string> {
  if (!ANON_KEY) return {};

  return {
    apikey: ANON_KEY,
    authorization: `Bearer ${ANON_KEY}`
  };
}

const TOKEN_COOKIE = 'bbb_t';
const TOKEN_MAX_AGE = 60 * 60 * 24 * 400;
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

export function browserToken(): string {
  const existing = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith(`${TOKEN_COOKIE}=`))
    ?.slice(TOKEN_COOKIE.length + 1);

  if (existing && TOKEN_RE.test(existing)) return existing;

  const token = crypto.randomUUID();
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${TOKEN_COOKIE}=${token}; Path=/; Max-Age=${TOKEN_MAX_AGE}; SameSite=Lax${secure}`;
  return token;
}
