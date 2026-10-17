/*
  These execute the rules that decide whether a comment posts, edits or deletes.

  Every one of them sat inside an async function in comments.ts, below
  `if (!supabaseWritable) return ...`. There are no v2 keys, so that early return is the
  only branch any gate has ever taken and none of this had run anywhere. The one level of
  threading rule is a settled decision enforced in exactly one place, and that place had
  never executed.
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMENTS_OFF,
  bodyProblem,
  parentProblem,
  limitProblem,
  checkEdit,
  deleteStep
} from '../src/lib/comment-rules.ts';

import {
  BODY_MAX,
  COMMENTS_PER_HOUR,
  COMMENTS_PER_DAY,
  EDIT_WINDOW_MINUTES
} from '../src/lib/thread.ts';

const MINUTE = 60 * 1000;
const NOW = Date.UTC(2026, 6, 31, 12, 0, 0);
const agoMinutes = (m) => new Date(NOW - m * MINUTE).toISOString();

const parent = (over = {}) => ({
  parent_id: null,
  target_kind: 'content',
  target_key: 'post-one',
  status: 'visible',
  ...over
});

const mine = (over = {}) => ({
  author_id: 'me',
  status: 'visible',
  created_at: agoMinutes(1),
  ...over
});

test('comments being off is a 503, because nothing the person typed is wrong', () => {
  assert.equal(COMMENTS_OFF.status, 503);
  assert.equal(COMMENTS_OFF.ok, false);
});

test('an empty comment is refused, whitespace included', () => {
  assert.equal(bodyProblem('').status, 400);
  /* The caller trims before asking, so this is the shape it hands over. */
  assert.equal(bodyProblem('   '.trim()).status, 400);
});

test('a comment is refused one character over the limit and allowed on it', () => {
  assert.equal(bodyProblem('x'.repeat(BODY_MAX)), null);
  assert.equal(bodyProblem('x'.repeat(BODY_MAX + 1)).status, 400);
});

test('a reply to a reply is refused, which is the whole of one level threading', () => {
  const problem = parentProblem(parent({ parent_id: 'somebody-else' }), {
    kind: 'content',
    key: 'post-one'
  });
  assert.equal(problem.status, 400);
  assert.match(problem.error, /one level deep/);
});

test('a parent on another page and a parent that is not there read the same', () => {
  const want = { kind: 'content', key: 'post-one' };
  const missing = parentProblem(null, want);
  const elsewhere = parentProblem(parent({ target_key: 'post-two' }), want);
  assert.equal(missing.error, elsewhere.error);
  assert.equal(missing.status, elsewhere.status);
});

test('a held or hidden parent takes no replies', () => {
  const want = { kind: 'content', key: 'post-one' };
  for (const status of ['held', 'hidden', 'deleted']) {
    const problem = parentProblem(parent({ status }), want);
    assert.ok(problem, `${status} accepted a reply`);
    assert.match(problem.error, /not taking replies/);
  }
  assert.equal(parentProblem(parent(), want), null);
});

test('the rate limit bites on the number rather than one past it', () => {
  assert.equal(limitProblem(COMMENTS_PER_HOUR - 1, 0), null);
  assert.equal(limitProblem(COMMENTS_PER_HOUR, 0).status, 429);
  assert.equal(limitProblem(0, COMMENTS_PER_DAY).status, 429);
  assert.equal(limitProblem(0, COMMENTS_PER_DAY - 1), null);
});

test('the hourly limit is reported before the daily one when both are hit', () => {
  const both = limitProblem(COMMENTS_PER_HOUR, COMMENTS_PER_DAY);
  assert.match(both.error, /in an hour/);
});

test("somebody else's comment and a missing one both refuse the same way", () => {
  const notMine = checkEdit(mine({ author_id: 'someone' }), 'me');
  const missing = checkEdit(null, 'me');

  assert.equal(notMine.ok, false);
  assert.equal(missing.ok, false);
  assert.equal(notMine.result.error, missing.result.error);
  assert.equal(notMine.result.status, 404);
});

test('the edit window shuts on the boundary rather than a minute later', () => {
  assert.equal(checkEdit(mine({ created_at: agoMinutes(EDIT_WINDOW_MINUTES) }), 'me', NOW).ok, true);

  const late = checkEdit(mine({ created_at: agoMinutes(EDIT_WINDOW_MINUTES + 1) }), 'me', NOW);
  assert.equal(late.ok, false);
  assert.equal(late.result.status, 409);
  assert.match(late.result.error, new RegExp(`${EDIT_WINDOW_MINUTES} minutes`));
});

test('a comment with no timestamp is past its window rather than inside it', () => {
  /*
    An unparseable date makes the arithmetic NaN, and NaN fails every comparison. That
    closes the window, which is the safe direction, and it is asserted because the other
    direction would have left every such row editable forever.
  */
  const gone = checkEdit(mine({ created_at: undefined }), 'me', NOW);
  assert.equal(gone.ok, false);
  assert.equal(gone.result.status, 409);
});

test('a deleted or hidden comment cannot be edited back into existence', () => {
  for (const status of ['deleted', 'hidden']) {
    const check = checkEdit(mine({ status }), 'me', NOW);
    assert.equal(check.ok, false, `${status} was editable`);
    assert.match(check.result.error, /is gone/);
  }
});

test('a held comment is still editable by its author', () => {
  const check = checkEdit(mine({ status: 'held' }), 'me', NOW);
  assert.equal(check.ok, true);
  assert.equal(check.row.status, 'held');
});

test('editing hands the row back so the caller never asserts it is there', () => {
  const check = checkEdit(mine(), 'me', NOW);
  assert.equal(check.ok, true);
  assert.equal(check.row.author_id, 'me');
});

test("deleting somebody else's comment refuses, and says delete rather than edit", () => {
  const step = deleteStep(mine({ author_id: 'someone' }), 'me');
  assert.equal(step.step, 'refuse');
  assert.equal(step.result.status, 404);
  assert.match(step.result.error, /to delete/);
});

test('deleting a comment that is already a tombstone reports success', () => {
  /*
    Asking twice and getting an error the second time makes a retry look like a failure.
    The outcome the person asked for is already true.
  */
  assert.equal(deleteStep(mine({ status: 'deleted' }), 'me').step, 'done');
});

test('deleting your own visible or held comment goes ahead', () => {
  assert.equal(deleteStep(mine(), 'me').step, 'delete');
  assert.equal(deleteStep(mine({ status: 'held' }), 'me').step, 'delete');
  assert.equal(deleteStep(mine({ status: 'hidden' }), 'me').step, 'delete');
});

test("a row with no author is nobody's to edit or delete", () => {
  /*
    A tombstone carries a null author_id. Nothing should let a null match a null and hand
    somebody else's row over, which a bare equality check would do if the asker were also
    absent.
  */
  assert.equal(checkEdit(mine({ author_id: null }), 'me', NOW).ok, false);
  assert.equal(deleteStep(mine({ author_id: null }), 'me').step, 'refuse');
});

test('comment-rules keeps the file extension on its thread import', async () => {
  /*
    The one assertion in this file that reads source rather than running it, because what
    it guards is a module specifier and there is nothing to execute.

    node will not resolve an extensionless specifier, while `astro check` and the build
    both accept one. Measured: dropping the `.ts` makes node refuse to load this whole
    file with ERR_MODULE_NOT_FOUND, so the suite goes red rather than green and empty.
    This assertion names the cause, it does not catch a silent failure.
  */
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/lib/comment-rules.ts', import.meta.url), 'utf8');

  assert.match(src, /from '\.\/thread\.ts'/, 'the thread import lost its extension');
  assert.doesNotMatch(src, /from '\.\/thread'/, 'an extensionless thread import came back');
});
