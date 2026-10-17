/*
  Supabase clients.

  Three of them, and which one you reach for is a security decision rather than a
  convenience one.

  browserClient   anon key, runs in the reader's browser, sees only what RLS allows
  serverClient    anon key plus the reader's cookies, for rendering as that person
  serviceClient   service role, bypasses RLS entirely, never leaves the build server

  Astro uses the service client for build-time reads. Live likes and share intents are
  written by Supabase Edge Functions, where the IP secret stays off the browser.
*/

import { createBrowserClient, createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import type { Database } from './database.types';

const URL = import.meta.env.PUBLIC_SUPABASE_URL;
const ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * True when the site has been given a Supabase project to talk to. Everything that reads
 * from Supabase checks this and degrades rather than throwing, so a fork, a preview
 * build or a contributor with no keys still gets a working site with the social parts
 * quiet. The alternative is a build that dies on a missing environment variable, which
 * is a worse first five minutes for anybody.
 */
export const supabaseConfigured = Boolean(URL && ANON);

/**
 * True when accounts actually work end to end.
 *
 * Reading a profile goes through the service role, so a site with the public keys but no
 * service key cannot show anybody their own account even though the sign in handshake
 * would happily complete. Offering a sign in button in that state produces a person who
 * is authenticated and has nowhere to go, which is worse than saying accounts are off.
 * So the whole auth surface hangs off this one flag rather than off supabaseConfigured.
 */
export const supabaseWritable = Boolean(URL && import.meta.env.SUPABASE_SERVICE_ROLE_KEY);

function requireConfig() {
  if (!URL || !ANON) {
    throw new Error(
      'Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  return { url: URL, anon: ANON };
}

/** For islands. Reads only, and only what RLS lets this visitor see. */
export function browserClient() {
  const { url, anon } = requireConfig();
  return createBrowserClient<Database>(url, anon);
}

/**
 * For rendering a page as the person asking for it. Carries their session cookies, so
 * every query runs under their own row level security, not under ours.
 */
export function serverClient(cookies: AstroCookies, headers: Headers) {
  const { url, anon } = requireConfig();

  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return parseCookieHeader(headers.get('cookie') ?? '').map((c) => ({
          name: c.name,
          value: c.value ?? ''
        }));
      },
      setAll(list) {
        for (const { name, value, options } of list) {
          cookies.set(name, value, { ...options, path: '/' });
        }
      }
    }
  });
}

/**
 * Full access, no row level security. Server only.
 *
 * There is no import.meta.env fallback to the anon key here on purpose. A silent
 * downgrade to a weaker key is how a write path starts failing in a way that looks like
 * a permissions bug and gets "fixed" by loosening a policy.
 */
export function serviceClient() {
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !key) {
    throw new Error(
      'Supabase service access is not configured. Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return createClient<Database>(URL, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
