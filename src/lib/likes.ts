/*
  Likes.

  Decision 11: anonymous, no sign in, deduped by browser token plus hashed address,
  attributed when somebody happens to be signed in.

  The dedupe key is the pair, not the address alone. A strict unique on ip_hash would mean
  the first person behind an office or a household router gets to like a thing and
  everybody else behind that same address is told they already did. The pair keeps the
  block that matters, which is one browser hammering the button, without punishing people
  for sharing a connection.

  The Edge Function owns live reads and writes. This file only loads counts for the build.
*/

import { serviceClient, supabaseWritable } from './supabase';
import { isLikeTarget, LIKE_TARGETS, type LikeTarget } from './reader';

export type { TargetKind, LikeTarget } from './reader';

/*
  Every count on the site, read once per build and grouped by kind.

  Decision 32 keeps content pages at zero JavaScript, so a number printed on a card is a
  build time snapshot and is honestly approximate. Only the single control on a detail
  page reads and writes live, and it reconciles the moment it hydrates.

  Read in one query rather than one per page. There are over a hundred and fifty pages and
  the whole table is three columns, so a page at a time would be a hundred and fifty round
  trips to save a few kilobytes of memory.
*/
let allCounts: Map<LikeTarget, Map<string, number>> | null = null;

async function loadCounts(): Promise<Map<LikeTarget, Map<string, number>>> {
  if (allCounts) return allCounts;

  const built = new Map<LikeTarget, Map<string, number>>();
  for (const kind of LIKE_TARGETS) built.set(kind, new Map());

  if (supabaseWritable) {
    const { data } = await serviceClient()
      .from('like_counts')
      .select('target_kind, target_key, likes');

    for (const row of data ?? []) {
      if (!isLikeTarget(row.target_kind) || !row.target_key) continue;
      built.get(row.target_kind)!.set(row.target_key, Number(row.likes ?? 0));
    }
  }

  allCounts = built;
  return built;
}

/** Every count for one kind, keyed by target. Empty when Supabase is not configured. */
export async function bakedLikes(kind: LikeTarget): Promise<Map<string, number>> {
  return (await loadCounts()).get(kind)!;
}

/** One count, for a page that only needs its own. */
export async function bakedLike(kind: LikeTarget, key: string): Promise<number> {
  return (await bakedLikes(kind)).get(key) ?? 0;
}
