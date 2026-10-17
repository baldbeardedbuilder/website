/*
  Shaping a badge shelf.

  Split out of profiles.ts because this is the part with rules in it and profiles.ts is
  the part with a database in it. Nothing here imports Supabase, which means plain node can
  run it and the tests do not need a project, a key or a network.

  The rules, in one place so they can be argued with:

  1. A numeral only appears on a family with more than one step. "Confessor I" on a badge
     with no second tier reads as a bug.
  2. Every earned badge is shown, plus the next unearned step in each family, and nothing
     beyond that. Somebody who has not earned Front Row I has no business being shown
     Front Row II, III and IV, and a brand new profile that renders the entire catalogue in
     grey is a to do list nobody asked for. It also happens to be what makes the empty
     shelf look deliberate: one plaque per family rather than seventeen dark ones.
  3. Progress only appears on that next step, and never on a threshold of one, because
     "0 of 1" tells somebody nothing the dark plaque did not already. It also never appears
     at zero: an empty bar under a badge nobody has started is decoration, and on a day one
     shelf it would be decoration ten times over.
  4. Earned badges sort first. The shelf is a record of what somebody did, not a checklist.
*/

import type { StatusTone } from '../config/site';

export interface ShelfBadge {
  id: string;
  family: string | null;
  tier: number | null;
  name: string;
  description: string;
  category: 'presence' | 'craft' | 'care';
  tone: StatusTone;
  earned: boolean;
  /** Roman numeral for tiered families, null for a badge that has only one step. */
  numeral: string | null;
  /** How far along the next unearned badge in a family is. Null everywhere else. */
  progress: { n: number; threshold: number } | null;
}

/* The shape badge_shelf returns. Every column nullable, because it is a view. */
export interface ShelfRow {
  badge_id: string | null;
  family: string | null;
  tier: number | null;
  name: string | null;
  description: string | null;
  category: string | null;
  tone: string | null;
  sort_order: number | null;
}

/* The shape badge_progress returns. */
export interface ProgressRow {
  badge_id: string;
  event: string;
  n: number;
  threshold: number;
  earned: boolean;
}

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function numeral(tier: number | null, familySize: number): string | null {
  if (!tier || familySize < 2) return null;
  return NUMERALS[tier] ?? String(tier);
}

/*
  What a page needs to nudge somebody towards one badge rather than draw the whole shelf.
  The label carries its numeral already, because "First Reply II" is the name a reader
  will see on the shelf and two names for one badge is a bug report waiting to happen.
*/
export interface NextStep {
  id: string;
  label: string;
  /** What the threshold counts, so copy can name the unit rather than say "1 more". */
  unit: string | null;
  /** How many of that unit are left. Never below one, since an earned step is not next. */
  remaining: number;
}

/*
  Event names are database vocabulary and nobody wants to read "1 more site:comment". The
  map lives here rather than in a component because it is a rule about the counters, and
  because here it can be tested without a browser. An event with no entry gets no noun,
  and the caller writes a sentence that does not need one.
*/
const UNITS: Record<string, string> = {
  'site:comment': 'reply',
  'site:comment-thread': 'thread',
  'stream:attended': 'stream',
  onChatMessage: 'message'
};

export function unitFor(event: string | null | undefined): string | null {
  return (event && UNITS[event]) ?? null;
}

/**
 * The lowest step in one family this profile has not earned, and how far off it is.
 *
 * Same rule as the shelf's next step in rule 2, narrowed to a single family so a page can
 * point at one badge. Null once the family is finished, because there is nothing left to
 * aim at, and null for a family with no counter behind it, because a manual badge has no
 * honest number to quote.
 */
export function nextStep(
  shelf: ShelfRow[],
  progress: ProgressRow[],
  family: string
): NextStep | null {
  const byBadge = new Map(progress.map((r) => [r.badge_id, r]));

  const rows = shelf.filter(
    (row) => row.badge_id && row.name && (row.family ?? row.badge_id) === family
  );
  if (rows.length === 0) return null;

  const step = [...rows]
    .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))
    .find((row) => !byBadge.get(row.badge_id!)?.earned);

  if (!step) return null;

  const p = byBadge.get(step.badge_id!);
  if (!p) return null;

  const num = numeral(step.tier, rows.length);

  return {
    id: step.badge_id!,
    label: num ? `${step.name} ${num}` : step.name!,
    unit: unitFor(p.event),
    remaining: Math.max(1, p.threshold - Number(p.n))
  };
}

export function shapeShelf(shelf: ShelfRow[], progress: ProgressRow[]): ShelfBadge[] {
  const byBadge = new Map(progress.map((r) => [r.badge_id, r]));
  const earned = new Set(progress.filter((r) => r.earned).map((r) => r.badge_id));

  const familySizes = new Map<string, number>();
  for (const row of shelf) {
    if (!row.family) continue;
    familySizes.set(row.family, (familySizes.get(row.family) ?? 0) + 1);
  }

  /*
    The next step in each family. Sorted by tier so the lowest unearned one wins, with
    untiered badges treated as a family of one so they still qualify.
  */
  const next = new Set<string>();
  const seen = new Set<string>();
  for (const row of [...shelf].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))) {
    if (!row.badge_id) continue;
    const key = row.family ?? row.badge_id;
    if (seen.has(key) || earned.has(row.badge_id)) continue;
    seen.add(key);
    next.add(row.badge_id);
  }

  /*
    Every column on a view comes back nullable, because Postgres will not promise a view
    preserves not-null. The rows are all real, so this filter is a type narrowing rather
    than a data check, but it is the honest way to say so.
  */
  return shelf
    .filter((row) => row.badge_id && row.name && row.description)
    /*
      Earned badges, plus the next step in each family. A locked tier further out is
      dropped rather than dimmed, which is rule 2 above.
    */
    .filter((row) => earned.has(row.badge_id!) || next.has(row.badge_id!))
    .map((row) => {
      const id = row.badge_id!;
      const p = byBadge.get(id);
      const show = Boolean(p && !p.earned && next.has(id) && p.threshold > 1 && p.n > 0);

      return {
        id,
        family: row.family,
        tier: row.tier,
        name: row.name!,
        description: row.description!,
        category: (row.category ?? 'presence') as ShelfBadge['category'],
        tone: (row.tone ?? 'info') as StatusTone,
        earned: earned.has(id),
        numeral: numeral(row.tier, familySizes.get(row.family ?? '') ?? 1),
        progress: show ? { n: Number(p!.n), threshold: p!.threshold } : null
      };
    })
    .sort((a, b) => Number(b.earned) - Number(a.earned));
}
