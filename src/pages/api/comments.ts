/* Older thread data stays readable for compatibility, but retired accounts cannot mutate it. */

import type { APIRoute } from 'astro';
import { readThread, BODY_MAX, EDIT_WINDOW_MINUTES } from '../../lib/comments';
import { isTargetKey, isTargetKind } from '../../lib/reader';

export const prerender = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

const bad = (message: string, status = 400) => json({ error: message }, status);

export const GET: APIRoute = async (context) => {
  const kind = context.url.searchParams.get('kind');
  const key = context.url.searchParams.get('key');

  if (!isTargetKind(kind) || !isTargetKey(key)) return bad('Unknown target.');

  const thread = await readThread(kind, key, null);

  return json({
    ...thread,
    nudge: null,
    viewer: null,
    limits: { bodyMax: BODY_MAX, editWindowMinutes: EDIT_WINDOW_MINUTES }
  });
};

const retired: APIRoute = async () => bad('Comments are no longer available.', 410);

export const POST = retired;
export const PATCH = retired;
export const DELETE = retired;
