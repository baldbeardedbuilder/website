/*
  A private profile is not named on the dev disaster wall.

  Occurrence fifteen. tellersFor() reads profiles through serviceClient(), which bypasses
  RLS by design, and it selected id and handle with no filter. The public read policy on
  that table is `using (is_private = false and deleted_at is null)`, so the one query that
  reads handles for public display was the one place the database's own visibility rule did
  not apply.

  The shape of the damage is what makes it worth a gate. /builders/[handle] 404s for a
  private profile, and the 404 IS the privacy mechanism, so the same handle was printed as
  a link into that 404 from the wall, the front page lead and the story page. The site
  refused to confirm somebody existed on one route and confirmed it on three others.

  These were source assertions, because the wall is empty until the v2 Supabase project
  exists and a dist test would have passed by having nothing to look at. The behavioural
  half now runs for real in disaster.rows.test.mjs, against fixture rows, because the row
  logic moved to src/lib/disaster-rows.ts specifically so it could be executed rather than
  read. What stays here is what only source can show: that the query asks the database for
  the two visibility columns in the first place, and that no page draws a byline of its own.
  Neither of those is visible from the shaping functions.

  When the database is live these should be joined by a rendered check.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const disasters = read(path.join('src', 'lib', 'disasters.ts'));
const rows = read(path.join('src', 'lib', 'disaster-rows.ts'));

/*
  The pages that draw a byline, found rather than remembered.

  This was a hand written list of three, and decision 118 moved the front page off a
  dev disaster lead, which took its byline with it. A hand list would have gone red for
  a page that is now correct, and worse, it would have kept passing for a new page
  somebody added that drew a teller by hand.

  So the list is the set of page sources that mention a teller at all. A page with no
  byline is not in it and needs no guard; a page with one has to use the component.
*/
function pagesDrawingTellers(dir = path.join(ROOT, 'src', 'pages'), found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pagesDrawingTellers(full, found);
    } else if (entry.name.endsWith('.astro') && /teller/i.test(fs.readFileSync(full, 'utf8'))) {
      found.push(path.relative(ROOT, full));
    }
  }
  return found;
}

const PAGES = pagesDrawingTellers();

test('the byline query asks whether the profile is visible', () => {
  const q = disasters.match(/\.from\('profiles'\)[\s\S]{0,200}?\.in\('id', ids\)/);
  assert.ok(q, 'the profiles lookup in tellersFor is gone or no longer selects by id');

  assert.match(
    q[0],
    /is_private/,
    'tellersFor no longer reads is_private. It runs through serviceClient(), which does ' +
      'not inherit RLS, so a private profile would be named on the public wall.'
  );
  assert.match(
    q[0],
    /deleted_at/,
    'tellersFor no longer reads deleted_at, so a deleted account would still be named'
  );
});

test('a hidden profile is turned into anonymous rather than dropped', () => {
  /*
    Behaviour is proved by running this in disaster.rows.test.mjs. What is asserted here is
    that the rule is still written where the service query can reach it, with the comment
    that stops somebody deleting it as redundant.
  */
  assert.match(
    rows,
    /is_private \|\| p\.deleted_at !== null/,
    'the visibility predicate is no longer applied to each profile row'
  );
  /*
    Comment text is matched against the file with its wrapping collapsed, because this note
    spans three lines and a regex written against one of them would break the next time
    somebody reflows the paragraph.
  */
  const prose = rows.replace(/\r?\n\s*\*?\s*/g, ' ');
  assert.match(
    prose,
    /Do not delete this as redundant\. It is not inherited\./,
    'the note explaining that a service role query does not inherit RLS is gone, which is ' +
      'how this predicate gets removed as pointless by somebody reading it cold'
  );
});

test('a lookup that finds nothing does not claim the teller chose anonymity', () => {
  assert.match(
    rows,
    /shown: 'nothing'/,
    'the unresolved case is gone, so a missing profile would render as a deliberate choice'
  );
  assert.doesNotMatch(
    rows,
    /tellers\.get\([^)]*\) \?\? null/,
    'tellerFor is back to collapsing a map miss into the same value as anonymity'
  );
});

test('no page draws a byline of its own', () => {
  /*
    A walk that finds nowhere to go proves nothing, and would report clean the day
    somebody renames the component. Two pages is the floor: the story page and the wall.
  */
  assert.ok(
    PAGES.length >= 2,
    `only ${PAGES.length} page sources mention a teller. Either the byline moved out of ` +
      'src/pages or the walk stopped finding them, and either way this test is now ' +
      'guarding nothing.'
  );
  for (const p of PAGES) {
    const s = read(p);
    assert.doesNotMatch(
      s,
      /teller \?/,
      `${p} is drawing a teller with its own ternary again. Three copies of that ternary ` +
        'is how the privacy rule came to be applied in a query and not in a byline.'
    );
    assert.match(
      s,
      /<Teller teller=/,
      `${p} no longer renders the Teller component, so its byline rule can drift`
    );
  }
});

test('the byline component refuses to name an unresolved teller', () => {
  const c = read(path.join('src', 'components', 'Teller.astro'));
  assert.match(c, /shown === 'handle'/, 'the component no longer branches on a resolved handle');
  assert.doesNotMatch(c, /\/builders\//, 'retired profile pages are linked from a byline');
  assert.match(
    c,
    /shown === 'anonymous'/,
    'the component no longer treats anonymous as its own case, so it may be drawing a ' +
      'handle or a blank for it'
  );
});

/*
  The same rule on the second surface, which is a view rather than a query.

  Comment bylines come out of comments_public, which left joins profiles. The view is
  security_invoker, so RLS on profiles applies to the join, and that sounds like cover
  until you read the grants: anon and authenticated are revoked entirely and service_role
  is the only grantee. readThread() reads it with the service role, which bypasses RLS. So
  the only reader of these bylines is the only reader RLS never covered, and the fix has to
  restate the predicate in the view.

  These tests read the LAST migration that creates the view rather than a named one. That
  is deliberate. Writing this fix, I edited the definition in the security fixup migration
  and was two steps from shipping it, having missed that a later migration had already
  dropped and recreated the view with a tombstone column my version did not have. A test
  pinned to a filename would have passed while the live view differed.
*/

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

test('a story cannot lose its author without becoming anonymous', () => {
  const sql = lastCreating('disasters_author_pairing');
  assert.match(
    sql,
    /check \(is_anonymous or author_id is not null\)/,
    'decision 105 is gone. author_id null with is_anonymous false is a story that claims ' +
      'a named teller and cannot name one.'
  );
});
