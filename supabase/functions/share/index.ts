import { serviceClient, serviceConfigured } from '../_shared/client.ts';
import { empty, json, preflight } from '../_shared/http.ts';
import { clientIp, hashIp, isTargetKey, isTargetKind } from '../_shared/request.ts';

const PLATFORMS: readonly string[] = ['x', 'bluesky', 'linkedin', 'facebook', 'copy'];
const INTENTS_PER_HOUR = 120;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return empty(405);
  if (!serviceConfigured()) return empty(204);

  let payload: { kind?: unknown; key?: unknown; platform?: unknown };
  try {
    payload = await request.json();
  } catch {
    return empty(400);
  }

  const { kind, key, platform } = payload;
  if (
    !isTargetKind(kind) ||
    !isTargetKey(key) ||
    typeof platform !== 'string' ||
    !PLATFORMS.includes(platform)
  ) {
    return empty(400);
  }

  try {
    const db = serviceClient();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const ipHash = await hashIp(clientIp(request));

    const { count, error: countError } = await db
      .from('share_intents')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', since);

    if (countError) throw new Error('Could not check share limit.');
    if ((count ?? 0) >= INTENTS_PER_HOUR) return empty(429);

    const { error } = await db.from('share_intents').insert({
      target_kind: kind,
      target_key: key,
      platform,
      ip_hash: ipHash
    });
    if (error) throw new Error('Could not record share intent.');

    return empty(204);
  } catch (error) {
    console.error('[share] record failed', error);
    return json({ error: 'Share intent could not be recorded.' }, 503);
  }
});
