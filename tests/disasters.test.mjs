/*
  Dev disaster invariants.

  This file used to check sixteen rows in src/config/disasters.seed.json. That file has
  been deleted and the wall now reads published rows out of Supabase, so there is no
  committed data left to check and these tests would have gone with it.

  They should not have. The rule they were enforcing is real and it outlived the data:
  the archive at /dev-disasters/[...filter] serves its severity and sort views from the
  same path segment a story slug occupies, so a story slugged "newest" sits on top of the
  "all, newest" view. What changed is where that rule has to hold. It used to hold because
  a human wrote the seed file and a test read it.

  So these tests check the wiring instead of the data. That matters more than it sounds,
  because when the seed was deleted the wiring did not exist: RESERVED_DISASTER_SLUGS was
  exported from site.ts and imported by nothing at all. The test over the seed was the only
  enforcement, and it was about to be deleted along with its subject.

  Read as source rather than imported because both files are TypeScript and this is a
  plain node test. That is a weaker check than calling the code, and it is the reason each
  assertion below names the exact thing it is looking for rather than matching loosely.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const site = read('../src/config/site.ts');
const disastersLib = read('../src/lib/disasters.ts');

/*
  site.ts is TypeScript, so a plain node test cannot import it. Each list is sliced out
  by its own declaration first, then scanned, so the two id patterns cannot cross over
  into each other.
*/
const block = (name) => {
  const m = site.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\n\\] as const;`));
  assert.ok(m, `${name} was not found in site.ts`);
  return m[1];
};

const severities = [...block('SEVERITIES').matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
const sorts = [...block('DISASTER_SORTS').matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);

test('the severity list parsed out of site.ts is the expected four', () => {
  assert.deepEqual(severities, ['error', 'warning', 'info', 'hint']);
});

test('the sort list parsed out of site.ts is the expected three', () => {
  assert.deepEqual(sorts, ['liked', 'replies', 'newest']);
});

/*
  The reserved list is built from the other two rather than typed out again, so it cannot
  fall behind them. Asserting that it is derived is stronger than asserting its contents,
  because a literal list would pass a contents check on the day it was written and then
  quietly stop covering a severity somebody added afterwards.
*/
test('the reserved slug list is derived from the severities and sorts, not retyped', () => {
  const m = site.match(/export const RESERVED_DISASTER_SLUGS = \[([\s\S]*?)\] as string\[\];/);
  assert.ok(m, 'RESERVED_DISASTER_SLUGS was not found in site.ts');
  assert.match(m[1], /\.\.\.SEVERITIES\.map/, 'the severities are not spread into it');
  assert.match(m[1], /\.\.\.DISASTER_SORTS\.map/, 'the sorts are not spread into it');
  assert.match(m[1], /'all'/, "the archive's own /dev-disasters/all/ view is not reserved");
});

/*
  The seed file is gone and must stay gone. Michael is loading the real data himself, and
  a fabricated dataset reappearing in the repo would put manufactured stories, and the
  engagement numbers that came with them, back on a public site.
*/
test('nothing reads a committed disasters seed file any more', () => {
  /*
    Checked as an import rather than as a mention. The header of disasters.ts describes the
    seed file at length and why it went, which is history worth keeping, so a test that
    banned the words would force that explanation out of the one file it belongs in.
  */
  assert.doesNotMatch(
    disastersLib,
    /^import .*disasters\.seed/m,
    'src/lib/disasters.ts imports a seed file again'
  );
  assert.ok(
    !existsSync(fileURLToPath(new URL('../src/config/disasters.seed.json', import.meta.url))),
    'src/config/disasters.seed.json is back. Michael is loading the real data himself, and ' +
      'this file put fabricated stories and manufactured engagement counts on a public site.'
  );
  assert.match(
    disastersLib,
    /\.from\('disasters'\)/,
    'src/lib/disasters.ts does not read the disasters table'
  );
  assert.match(
    disastersLib,
    /\.eq\('status', 'published'\)/,
    'src/lib/disasters.ts does not filter to published rows, so pending stories would ship'
  );
});

/*
  An empty state has to be a sentence on every view it can appear on.

  "Nothing filed under ${scopeLabel} yet" is fine on /dev-disasters/error/ and is a
  sentence with a hole in it on /dev-disasters/, where scopeLabel is deliberately the
  empty string. That was unreachable for as long as a committed seed file guaranteed rows
  under every severity, and it became the default view of the section the moment the seed
  was deleted. It is worth a test because the next person to add a scope will reach for
  the same interpolation.
*/
test('the empty wall reads as a sentence on the all view, not just on a severity', () => {
  const archive = read('../src/pages/dev-disasters/[...filter].astro');

  const m = archive.match(/const emptyLine =([\s\S]*?);\r?\n/);
  assert.ok(m, 'the empty wall copy is not built as a single branched string any more');
  assert.match(m[1], /scope === 'all'/, 'the empty copy does not branch on the all scope');
  assert.doesNotMatch(
    archive,
    /Nothing filed under \{scopeLabel\}/,
    'the empty copy interpolates scopeLabel directly, which is blank on the all view'
  );
});

/*
  An unreadable database and an empty one are different things and must not draw the same
  page. Empty draws "Nobody has told me theirs yet", which is true on day one. Drawing
  that over a failed read would tell every visitor the wall is empty when it is not, and
  would do it silently.
*/
test('a failed read stops the build instead of drawing an empty wall', () => {
  assert.match(
    disastersLib,
    /if \(error\) throw new Error\(/,
    'a Supabase error is swallowed, so a failed read would render as an empty wall'
  );
  assert.match(
    disastersLib,
    /if \(!supabaseWritable\) return \[\];/,
    'an unconfigured site does not fall back to an empty list'
  );
});

/*
  A row the site cannot draw is dropped, not fatal. The severity check constraint on the
  column already rejects anything the schema does not know, so what is left here is drift
  between that constraint and SEVERITIES, and one row the site cannot classify must not
  take down every article and video on the site with it.
*/
/*
  The severity guard used to be asserted here by matching source. It is now executed in
  disaster.rows.test.mjs, which hands shapeDisasters a row with severity "catastrophe" and
  checks that one row is dropped, the rest survive, and the warning names the id. Matching
  source proved the code existed. Running it proves what it does, so the source assertion
  came out rather than being repointed at the new file.
*/
