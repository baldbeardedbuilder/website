/*
  A tombstone must be allowed to have no body.

  Deleting a comment is a soft delete: the row stays so replies underneath still have
  something to be replies to, and the body goes. Both places that do it write an empty
  body_markdown, and comments_body_length said every comment holds between 1 and 10000
  characters, unconditionally. So the update was rejected, the endpoint answered 500, and
  pressing Delete left the comment exactly where it was.

  None of this can be proved by running it. There is no Docker on this machine, the chain
  is never applied in CI, and comments.ts cannot even be imported by a test because it
  reaches ./supabase, which is a directory. What is left is reading the two things that
  have to agree: the constraint as the chain last leaves it, and the writes that have to
  satisfy it. That is exactly the pair that drifted.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

/* Comments are stripped so the prose in these files, which quotes the old constraint at
   length to explain it, is not mistaken for the constraint. */
const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

/** The last migration in version order that mentions the needle, which is the one that wins. */
function lastMigrationWith(needle) {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => strip(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')).includes(needle));

  assert.notEqual(files.length, 0, `nothing in the chain mentions ${needle}`);
  return strip(fs.readFileSync(path.join(MIGRATIONS, files[files.length - 1]), 'utf8'));
}

test('the last word on comments_body_length lets a deleted comment be empty', () => {
  const sql = lastMigrationWith('comments_body_length');

  const added = sql.slice(sql.lastIndexOf('add constraint comments_body_length'));
  assert.notEqual(added, '', 'the last migration to touch the constraint never adds it back');

  /*
    Named rather than pattern matched on the whole expression, because what matters is that
    the floor is conditional on status at all. An unconditional `between 1 and 10000` is the
    bug, and it cannot mention status.
  */
  assert.match(added, /status\s*=\s*'deleted'/, 'the length floor still ignores status');
  assert.doesNotMatch(
    added,
    /char_length\(body_markdown\)\s+between\s+1\s+and/i,
    'the unconditional length floor came back, which makes every delete fail'
  );
});

test('the ceiling on a comment body survived the fix', () => {
  const sql = lastMigrationWith('comments_body_length');
  const added = sql.slice(sql.lastIndexOf('add constraint comments_body_length'));

  assert.match(added, /char_length\(body_markdown\)\s*<=\s*10000/, 'the 10000 character ceiling is gone');
});

test('both places that make a tombstone empty the body, which is what needed allowing', () => {
  /* deleteComment(). The comment thread's Delete control ends up here. */
  assert.match(
    read('src', 'lib', 'comments.ts'),
    /status: 'deleted',[\s\S]{0,400}?body_markdown: ''/,
    'deleteComment no longer clears the body'
  );

  /*
    deleteAccount(). This one mattered more than it looks: the comment update runs before
    the auth user is removed, so its failure aborted the delete and told somebody asking to
    leave that nothing had changed.
  */
  assert.match(
    read('src', 'lib', 'account.ts'),
    /status: 'deleted',[\s\S]{0,400}?body_markdown: ''/,
    'deleteAccount no longer tombstones comments with an empty body'
  );
});

test('a failed delete says delete rather than save', () => {
  /*
    The island shows whatever the endpoint sends. "That did not save." is the wording for a
    write that was meant to keep words, and reading it after pressing Delete is a small lie
    about which thing failed.
  */
  const src = read('src', 'lib', 'comments.ts');
  const deleteFn = src.slice(src.indexOf('export async function deleteComment'));

  assert.match(deleteFn, /error: 'That did not delete\.'/);
  assert.doesNotMatch(deleteFn, /error: 'That did not save\.'/);
});
