/*
  The like endpoint.

  POST toggles, GET reads. Both answer with the same shape so the island has one code
  path for "what is the state" and "the state changed".

  Likes are anonymous. A browser token and address hash stop one person from moving the
  count over and over.
*/

import type { APIRoute } from 'astro';
import {
  browserToken,
  clientIp,
  hashIp,
  isTargetKey,
  isLikeTarget,
  readLike,
  toggleLike
} from '../../lib/likes';
import { serviceClient, supabaseWritable } from '../../lib/supabase';

export const prerender = false;

/*
  Open item settled here: sixty like actions an hour from one address.

  A person reading through the archive and liking as they go will not get near it. A
  script cycling browser tokens to inflate a count will, because the token is the one
  thing it can forge freely and the address is the one thing it cannot. Deliberately
  counted per address rather than per token for that reason.

  Known gap, stated rather than hidden: this counts rows that exist, so a script that
  likes and immediately unlikes never accumulates any and never trips the limit. That
  costs writes but it cannot move a number, which is the thing worth protecting. If the
  writes ever become the problem, the answer is a rate limit at the edge, not a counter
  table here.
*/
const LIKES_PER_HOUR = 60;

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

export const GET: APIRoute = async (context) => {
  const kind = context.url.searchParams.get('kind');
  const key = context.url.searchParams.get('key');

  if (!isLikeTarget(kind) || !isTargetKey(key)) return bad('Unknown target.');

  const token = browserToken(context);
  return ok(await readLike(kind, key, token));
};

export const POST: APIRoute = async (context) => {
  if (!supabaseWritable) return bad('Likes are not available right now.', 503);

  let payload: { kind?: unknown; key?: unknown };
  try {
    payload = await context.request.json();
  } catch {
    return bad('Send JSON.');
  }

  const { kind, key } = payload;
  if (!isLikeTarget(kind) || !isTargetKey(key)) return bad('Unknown target.');

  const token = browserToken(context);
  const ip = clientIp(context);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await serviceClient()
    .from('likes')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', hashIp(ip))
    .gte('created_at', since);

  if ((count ?? 0) >= LIKES_PER_HOUR) {
    return bad('That is a lot of liking. Give it an hour.', 429);
  }

  const state = await toggleLike(kind, key, token, ip, null);
  return ok(state);
};
