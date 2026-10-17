/*
  Reading a builder profile.

  One function, because a profile page is one round trip's worth of questions and
  splitting them across five exported helpers would turn it into five.

  Everything here degrades. If Supabase is not configured, or the profile does not exist,
  or it is private, the caller gets null and renders a 404. A private profile and a
  missing profile return the same thing on purpose: "this person has gone private" is
  itself information about a person who asked not to be findable.
*/

import { serviceClient, supabaseWritable } from './supabase';
import { shapeShelf } from './shelf';
import type { ProgressRow, ShelfBadge } from './shelf';

export type { ShelfBadge } from './shelf';

export interface BuilderProfile {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  links: { label: string; url: string }[];
  githubLogin: string | null;
  twitchLinked: boolean;
  joined: Date;
  stats: {
    comments: number;
    streamsWatched: number;
  };
  badges: ShelfBadge[];
}

export async function getBuilderProfile(handle: string): Promise<BuilderProfile | null> {
  if (!supabaseWritable) return null;

  let db;
  try {
    db = serviceClient();
  } catch {
    return null;
  }

  const { data: profile } = await db
    .from('profiles')
    .select('id, handle, display_name, avatar_url, bio, links, github_login, twitch_user_id, twitch_login, created_at, is_private, deleted_at')
    .eq('handle', handle)
    .maybeSingle();

  if (!profile || profile.is_private || profile.deleted_at) return null;

  const [progress, shelf, commentCount, streamCount, firstSeen] = await Promise.all([
    /*
      One call rather than two. badge_progress answers both "which of these has this person
      got" and "how close are they to the next one", from the same counter the triggers
      grant on, so the shelf can never show a full progress bar next to an unearned badge.
    */
    db.rpc('badge_progress', { p_profile: profile.id }),
    db.from('badge_shelf').select('badge_id, family, tier, name, description, category, tone, sort_order'),
    db
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profile.id)
      .eq('status', 'visible'),
    /*
      Streams watched comes from the Twitch history, which is keyed by login rather than
      by profile. Only a linked account has an honest number here, and an unlinked one
      gets zero rather than a guess.

      This has to be an RPC because the number wanted is distinct stream days, not row
      count. One talkative evening is hundreds of rows and is still one stream, so a plain
      count would inflate the figure by an order of magnitude or two.
    */
    profile.twitch_login
      ? db.rpc('streams_watched', { p_login: profile.twitch_login })
      : Promise.resolve({ data: 0 }),
    /*
      An honest joined date.

      profiles.created_at is the day somebody first signed in to v2, which for everybody
      is going to be launch week. A linked Twitch account carries a better answer, so it
      wins when it exists.
    */
    profile.twitch_login
      ? db.rpc('twitch_first_seen', { p_login: profile.twitch_login })
      : Promise.resolve({ data: null })
  ]);

  const badges = shapeShelf(shelf.data ?? [], (progress.data ?? []) as ProgressRow[]);

  return {
    id: profile.id,
    handle: profile.handle,
    displayName: profile.display_name || profile.handle,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    links: normaliseLinks(profile.links),
    githubLogin: profile.github_login,
    twitchLinked: Boolean(profile.twitch_user_id),
    joined: firstSeen.data ? new Date(String(firstSeen.data)) : new Date(profile.created_at),
    stats: {
      comments: commentCount.count ?? 0,
      streamsWatched: streamCount.data ?? 0
    },
    badges
  };
}

/*
  Links are user supplied jsonb, so nothing about their shape is guaranteed. Anything
  that is not an http or https URL with a label is dropped rather than rendered, which
  also closes the javascript: URL that a stricter type would have let through.
*/
function normaliseLinks(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { label, url } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || typeof url !== 'string') return [];

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
      return [{ label: label.slice(0, 40), url: parsed.toString() }];
    } catch {
      return [];
    }
  });
}

/** Two letters for the avatar fallback, which is what the mockup draws. */
/**
 * Whether a viewer is looking at their own profile.
 *
 * Re-exported rather than defined here so it can be tested without loading the Supabase
 * client. The rule and its reasoning live in ownership.ts.
 */
export * from './ownership';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
