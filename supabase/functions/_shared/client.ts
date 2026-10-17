import { createClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../../src/lib/supabase/database.types.ts';

function serviceKey(): string | undefined {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(keys);
    } catch {
      throw new Error('SUPABASE_SECRET_KEYS is not valid JSON.');
    }

    if (parsed && typeof parsed === 'object' && 'default' in parsed) {
      const key = parsed.default;
      if (typeof key === 'string' && key) return key;
    }
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? undefined;
}

export function serviceConfigured(): boolean {
  return Boolean(Deno.env.get('SUPABASE_URL') && serviceKey());
}

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = serviceKey();
  if (!url || !key) throw new Error('Supabase service access is not configured.');

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
