import { serviceClient, serviceConfigured } from '../_shared/client.ts';
import { empty, json, preflight } from '../_shared/http.ts';
import {
  clientIp,
  hashIp,
  isBrowserToken,
  isLikeTarget,
  isTargetKey
} from '../_shared/request.ts';
import type { LikeTarget } from '../_shared/request.ts';

interface LikeState {
  likes: number;
  liked: boolean;
}

const LIKES_PER_HOUR = 60;

function bad(message: string, status = 400): Response {
  return json({ error: message }, status);
}

async function readLike(kind: LikeTarget, key: string, token: string): Promise<LikeState> {
  if (!serviceConfigured()) return { likes: 0, liked: false };

  const db = serviceClient();
  const [{ count, error: countError }, { data: mine, error: mineError }] = await Promise.all([
    db
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('target_kind', kind)
      .eq('target_key', key),
    db
      .from('likes')
      .select('id')
      .eq('target_kind', kind)
      .eq('target_key', key)
      .eq('browser_token', token)
      .maybeSingle()
  ]);

  if (countError || mineError) throw new Error('Could not read like state.');
  return { likes: count ?? 0, liked: Boolean(mine) };
}

async function toggleLike(
  kind: LikeTarget,
  key: string,
  token: string,
  ip: string
): Promise<LikeState> {
  const db = serviceClient();
  const { data: existing, error: readError } = await db
    .from('likes')
    .select('id')
    .eq('target_kind', kind)
    .eq('target_key', key)
    .eq('browser_token', token)
    .maybeSingle();

  if (readError) throw new Error('Could not read existing like.');

  if (existing) {
    const { error } = await db.from('likes').delete().eq('id', existing.id);
    if (error) throw new Error('Could not remove like.');
  } else {
    const { error } = await db.from('likes').insert({
      target_kind: kind,
      target_key: key,
      browser_token: token,
      ip_hash: await hashIp(ip),
      profile_id: null
    });
    if (error && error.code !== '23505') throw new Error('Could not save like.');
  }

  return readLike(kind, key, token);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET' && request.method !== 'POST') return empty(405);

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    const key = url.searchParams.get('key');
    const token = url.searchParams.get('token');
    if (!isLikeTarget(kind) || !isTargetKey(key) || !isBrowserToken(token)) {
      return bad('Unknown target.');
    }

    try {
      return json(await readLike(kind, key, token));
    } catch (error) {
      console.error('[like] read failed', error);
      return bad('Likes are not available right now.', 503);
    }
  }

  if (!serviceConfigured()) return bad('Likes are not available right now.', 503);

  let payload: { kind?: unknown; key?: unknown; token?: unknown };
  try {
    payload = await request.json();
  } catch {
    return bad('Send JSON.');
  }

  const { kind, key, token } = payload;
  if (!isLikeTarget(kind) || !isTargetKey(key) || !isBrowserToken(token)) {
    return bad('Unknown target.');
  }

  try {
    const ip = clientIp(request);
    const ipHash = await hashIp(ip);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await serviceClient()
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', since);

    if (error) throw new Error('Could not check like limit.');
    if ((count ?? 0) >= LIKES_PER_HOUR) {
      return bad('That is a lot of liking. Give it an hour.', 429);
    }

    return json(await toggleLike(kind, key, token, ip));
  } catch (error) {
    console.error('[like] update failed', error);
    return bad('Likes are not available right now.', 503);
  }
});
