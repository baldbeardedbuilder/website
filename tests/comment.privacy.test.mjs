import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIG = path.join(ROOT, 'supabase', 'migrations');
const migrations = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();

const lastCreating = (needle) => {
  const hit = migrations.filter((f) => fs.readFileSync(path.join(MIG, f), 'utf8').includes(needle)).pop();
  assert.ok(hit, `no migration contains ${needle}`);
  return fs.readFileSync(path.join(MIG, hit), 'utf8');
};

test('the comment view hides the byline of a private or deleted profile', () => {
  const sql = lastCreating('create view public.comments_public');
  for (const col of ['handle', 'display_name', 'avatar_url']) {
    const guarded = new RegExp(
      `is_private = false and p\\.deleted_at is null\\s*\\n\\s*then p\\.${col}`
    );
    assert.match(
      sql,
      guarded,
      `comments_public returns p.${col} without asking whether the profile is visible. ` +
        'Going private has to hide the name everywhere, and a service role read inherits ' +
        'no policy.'
    );
  }
});

test('the comment view is readable only by the role that bypasses RLS', () => {
  const sql = lastCreating('create view public.comments_public');
  assert.match(
    sql,
    /revoke all on public\.comments_public from anon, authenticated/,
    'the view is exposed to anon or authenticated again, which was undone once already'
  );
  assert.match(
    sql,
    /grant select on public\.comments_public to service_role/,
    'the service role grant is gone, so the API routes that read the thread lose access'
  );
});

test('the comment view still tells a reader what happened to a removed comment', () => {
  const sql = lastCreating('create view public.comments_public');
  assert.match(
    sql,
    /'account deleted'/,
    'the tombstone column is gone from comments_public. Hiding a name must not also ' +
      'delete the sentence that explains an empty row.'
  );
  assert.match(sql, /'comment removed'/, 'the other tombstone case is gone');
});
