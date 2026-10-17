/*
  The rules that decide whether a comment posts, edits or deletes.

  Every one of these sat inside an async function in comments.ts, below
  `if (!supabaseWritable) return ...`. There are no v2 keys, so that early return is the
  only branch any test, build or accessibility run has ever taken and none of this had
  executed anywhere. That includes the one level of threading rule, which is a settled
  decision enforced in exactly one place.

  None of it needs a database. It needs a body, a parent row and two counts. So it lives
  here, importing only thread.ts, which imports nothing. Same reasoning and same shape as
  profile-fields.ts.

  comments.ts itself cannot be imported by a test: it reaches ./supabase, which is a
  directory, and node refuses a directory import before any assertion runs.
*/

/*
  The extension is deliberate and must stay.

  `node --test` strips types but still resolves specifiers, and it will not resolve an
  extensionless one. Every other rule module on this branch sidesteps that by importing
  nothing but types, which are erased. This one needs the real edit window and the real
  limits, so it names the file. Vite and `astro check` both accept it.

  Measured rather than asserted: taking the extension off does not fail quietly. node
  refuses to load the test file at all and reports `ERR_MODULE_NOT_FOUND`, so the suite goes
  red rather than green with nothing in it. The test guarding this line exists to name the
  cause, not to catch a silent failure.
*/
import {
  withinEditWindow,
  BODY_MAX,
  COMMENTS_PER_DAY,
  COMMENTS_PER_HOUR,
  EDIT_WINDOW_MINUTES
} from './thread.ts';

/** The failing half of PostResult. Kept separate so a rule can return one without an id. */
export type Refusal = { ok: false; error: string; status: number };

/*
  Comments being off is a 503 and not a 400, because nothing the person typed is wrong.
  One constant because it is returned from four places and a wording drift between them
  reads as four different problems.
*/
export const COMMENTS_OFF: Refusal = {
  ok: false,
  error: 'Comments are off right now.',
  status: 503
};

/** Null when the body is postable, or the refusal to hand back. */
export function bodyProblem(body: string): Refusal | null {
  if (!body) return { ok: false, error: 'A comment needs some words in it.', status: 400 };
  if (body.length > BODY_MAX) {
    return { ok: false, error: 'That is longer than a comment box can hold.', status: 400 };
  }
  return null;
}

export interface ParentRow {
  parent_id: string | null;
  target_kind: string;
  /*
    `string` rather than the union, because that is what the database hands back. Typing it
    as the union here would push a cast onto the caller, which is the caller asserting a
    value is one of four things at the exact point nothing has checked it.
  */
  target_key: string;
  status: string;
}

/**
 * Null when a reply is allowed to attach to this parent.
 *
 * A parent that is missing and a parent on some other page draw the same answer, because
 * telling them apart turns a reply box into a way to ask whether an id exists.
 */
export function parentProblem(
  parent: ParentRow | null | undefined,
  want: { kind: string; key: string }
): Refusal | null {
  if (!parent || parent.target_kind !== want.kind || parent.target_key !== want.key) {
    return { ok: false, error: 'That reply has nowhere to go.', status: 400 };
  }
  /* Decision 16. One level of threading, enforced here and nowhere else. */
  if (parent.parent_id) {
    return { ok: false, error: 'Replies only go one level deep.', status: 400 };
  }
  if (parent.status !== 'visible') {
    return { ok: false, error: 'That comment is not taking replies.', status: 400 };
  }
  return null;
}

/**
 * Null when the account is inside both limits.
 *
 * Both are `>=` because the count is of comments already posted, so reaching the number is
 * being at the limit rather than one short of it.
 */
export function limitProblem(hourCount: number, dayCount: number): Refusal | null {
  if (hourCount >= COMMENTS_PER_HOUR) {
    return { ok: false, error: 'That is a lot of comments in an hour. Give it a bit.', status: 429 };
  }
  if (dayCount >= COMMENTS_PER_DAY) {
    return { ok: false, error: 'That is a lot of comments today. Try again tomorrow.', status: 429 };
  }
  return null;
}

export interface OwnedRow {
  author_id: string | null;
  status: string;
  created_at?: string;
}

export type EditCheck = { ok: false; result: Refusal } | { ok: true; row: OwnedRow };

/**
 * Whether this person may edit this row.
 *
 * It hands the row back on success rather than returning null, so the caller reads its
 * status without asserting it is there. A non null assertion after a check in another file
 * is the caller promising something it did not verify.
 */
export function checkEdit(
  existing: OwnedRow | null | undefined,
  authorId: string,
  now: number = Date.now()
): EditCheck {
  const refuse = (error: string, status: number): EditCheck => ({
    ok: false,
    result: { ok: false, error, status }
  });

  /*
    Somebody else's comment and a comment that is not there get the same answer. Telling
    the difference apart would turn this into a way to ask whether a given id exists.
  */
  if (!existing || existing.author_id !== authorId) {
    return refuse('That is not yours to edit.', 404);
  }
  if (existing.status === 'deleted' || existing.status === 'hidden') {
    return refuse('That comment is gone.', 409);
  }
  if (!withinEditWindow(existing.created_at ?? '', now)) {
    return refuse(`Edits close after ${EDIT_WINDOW_MINUTES} minutes.`, 409);
  }
  return { ok: true, row: existing };
}

export type DeleteStep =
  | { step: 'refuse'; result: Refusal }
  /* Already a tombstone. Saying so again is the same outcome, so it reports success. */
  | { step: 'done' }
  | { step: 'delete' };

/** What deleting this row should do, given who is asking. */
export function deleteStep(existing: OwnedRow | null | undefined, authorId: string): DeleteStep {
  if (!existing || existing.author_id !== authorId) {
    return {
      step: 'refuse',
      result: { ok: false, error: 'That is not yours to delete.', status: 404 }
    };
  }
  if (existing.status === 'deleted') return { step: 'done' };
  return { step: 'delete' };
}
