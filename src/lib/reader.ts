/*
  Shared validation and address hashing for the static build and Supabase Edge Functions.

  Content covers articles and videos together because target_key already carries the
  collection prefix, so splitting them would put the same fact in two columns and let them
  disagree.
*/
export type TargetKind = 'content';

export const KINDS: TargetKind[] = ['content'];

/*
  What the site lets a like point at. The database enum also retains the retired disaster
  target for existing rows, but the website no longer exposes it.

  Wider than TargetKind by exactly one: a comment can be liked but cannot be commented on.
  Two types rather than one, because letting the wider one stand in everywhere would allow
  a comment whose target is the kind "comment", which is not a thing that exists.
*/
export type LikeTarget = TargetKind | 'comment';

export const LIKE_TARGETS: LikeTarget[] = ['content', 'comment'];

export function isTargetKind(value: unknown): value is TargetKind {
  return typeof value === 'string' && KINDS.includes(value as TargetKind);
}

export function isLikeTarget(value: unknown): value is LikeTarget {
  return typeof value === 'string' && LIKE_TARGETS.includes(value as LikeTarget);
}

/*
  A key is a content key like "blog:some-post", or a comment id.

  The colon and the slash are allowed because content keys are "collection:id" and some
  ids are nested paths. The bound is what makes this a validator rather than decoration:
  anything longer than a real key is somebody feeding the unique index junk.
*/
const KEY_RE = /^[a-z0-9][a-z0-9._:/-]{0,127}$/i;

export function isTargetKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_RE.test(value);
}

/**
 * Turns an address into a dedupe token.
 *
 * Falls back to a constant when there is no secret configured, which collapses the address
 * half of the dedupe rather than silently hashing with an empty key and pretending the
 * protection is there. Rotating the secret forgets who liked what, which is the property
 * that makes this a token with a shelf life rather than a record of where readers live.
 *
 * The secret is passed in by the Edge Function so the build never needs to receive it.
 */
export async function hashIp(ip: string, secret?: string): Promise<string> {
  if (!secret) return 'no-secret';

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  );
  const binary = Array.from(signature, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
