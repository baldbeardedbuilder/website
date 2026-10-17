/*
  The share intent rules.

  Decision 122 says these are intents rather than shares, and the first test in here is
  about that word rather than about behaviour, because the name is the part somebody will
  quietly change later when it reads awkwardly in a query.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OUTBOUND_PLATFORMS,
  SHARE_LABELS,
  SHARE_PLATFORMS,
  isSharePlatform,
  shareIntentUrl,
  shareableUrl
} from '../src/lib/share-links.ts';
import { SHARE_MARKS } from '../src/lib/share-marks.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const URL_ = 'https://baldbeardedbuilder.com/csharp/some-post/';
const TITLE = 'Virtual vs Override';

test('every platform has a label and copy is one of them', () => {
  for (const p of SHARE_PLATFORMS) {
    assert.ok(SHARE_LABELS[p], `${p} has no label`);
  }
  assert.ok(SHARE_PLATFORMS.includes('copy'));
  assert.equal(OUTBOUND_PLATFORMS.length, SHARE_PLATFORMS.length - 1);
  assert.ok(!OUTBOUND_PLATFORMS.includes('copy'));
});

test('the platform list matches the check constraint in the migration', () => {
  const sql = read('supabase/migrations/20260804000000_share_intents.sql');
  const match = sql.match(/platform\s+text not null check \(platform in \(([^)]+)\)\)/);
  assert.ok(match, 'no platform check constraint found');

  const inSql = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .sort();

  assert.deepEqual(inSql, [...SHARE_PLATFORMS].sort());
});

test('a platform the database would refuse is refused before the insert', () => {
  assert.ok(isSharePlatform('bluesky'));
  assert.ok(isSharePlatform('copy'));
  assert.ok(!isSharePlatform('mastodon'));
  assert.ok(!isSharePlatform('X'));
  assert.ok(!isSharePlatform(''));
  assert.ok(!isSharePlatform(null));
  assert.ok(!isSharePlatform(undefined));
});

test('every intent url points at the platform it claims to', () => {
  const hosts = {
    x: 'x.com',
    bluesky: 'bsky.app',
    linkedin: 'www.linkedin.com',
    facebook: 'www.facebook.com'
  };

  for (const p of OUTBOUND_PLATFORMS) {
    const built = new URL(shareIntentUrl(p, URL_, TITLE));
    assert.equal(built.protocol, 'https:', `${p} is not https`);
    assert.equal(built.host, hosts[p], `${p} points at the wrong host`);
    /* The page url has to survive the round trip through encoding, on every one. */
    assert.ok(
      built.search.includes(encodeURIComponent(URL_)) ||
        decodeURIComponent(built.search).includes(URL_),
      `${p} lost the url`
    );
  }
});

/*
  This is the one that would have shipped broken. Several titles on this site carry an
  ampersand, and an unencoded one ends the text parameter early and silently drops the
  rest of the headline. Nothing about the resulting url looks wrong.
*/
test('an ampersand in a title does not truncate the compose text', () => {
  const title = 'Rider & Visual Studio';
  const built = new URL(shareIntentUrl('x', URL_, title));
  assert.equal(built.searchParams.get('text'), title);
  assert.equal(built.searchParams.get('url'), URL_);
});

test('bluesky carries the title and the url in its single text field', () => {
  const built = new URL(shareIntentUrl('bluesky', URL_, TITLE));
  assert.equal(built.searchParams.get('text'), `${TITLE} ${URL_}`);
});

test('the fragment and the query string are cut from a shared url', () => {
  assert.equal(shareableUrl(`${URL_}#comments`), URL_);
  assert.equal(shareableUrl(`${URL_}?utm_source=newsletter`), URL_);
  assert.equal(shareableUrl(`${URL_}?utm_source=x#comments`), URL_);
  assert.equal(shareableUrl(URL_), URL_);
});

/*
  Decision 122 in one assertion. No user id, and no column that could grow into one.

  The ruling is explicit that this must not be added "for badges later", and a schema is
  the easiest place in the codebase for one extra column to look harmless.
*/
test('the share_intents table names nobody', () => {
  const sql = read('supabase/migrations/20260804000000_share_intents.sql');
  const create = sql.slice(sql.indexOf('create table public.share_intents'));
  const columns = create.slice(0, create.indexOf(');'));

  for (const banned of ['user_id', 'author_id', 'profile_id', 'browser_token']) {
    assert.ok(!columns.includes(banned), `share_intents grew a ${banned} column`);
  }
});

test('nothing calls a share intent a share', () => {
  /*
    The word share is unavoidable in a share menu. What must not appear is the plural
    noun used as a count, which is the reading decision 122 exists to prevent: 400 shares
    means 400 people posted, and this table cannot know that.
  */
  const sources = [
    'supabase/migrations/20260804000000_share_intents.sql',
    'src/lib/share-links.ts',
    'supabase/functions/share/index.ts',
    'src/components/ShareMenu.astro'
  ];

  for (const file of sources) {
    const text = read(file);
    assert.ok(
      !/\btable public\.shares\b|\bfrom\('shares'\)|\bshare_count\b|\bshares\s*=/.test(text),
      `${file} counts shares rather than intents`
    );
  }
});

test('the share endpoint never answers with a count', () => {
  const route = read('supabase/functions/share/index.ts');
  assert.ok(!/request\.method === 'GET'/.test(route), 'the share endpoint grew a GET');
  assert.ok(!/JSON\.stringify/.test(route), 'the share endpoint grew a response body');
});

/*
  The four outbound destinations have to work with JavaScript off, which is only true if
  they are real anchors with a real href built at build time. The mockup built them from
  location.href at click time, and that version would render five dead buttons.
*/
test('the outbound destinations are anchors with hrefs', () => {
  const menu = read('src/components/ShareMenu.astro');
  assert.match(menu, /<a\s+href=\{shareIntentUrl\(/);
  assert.match(menu, /<details/);
  /* Copy is the one that genuinely cannot work without a script, so it starts hidden. */
  assert.match(menu, /class="copy"[\s\S]{0,80}hidden/);
});

/* ------------------------------------------------------------------ *
   Decision 128. The destination marks.
 * ------------------------------------------------------------------ */

test('every share platform has a mark and every mark draws something', () => {
  for (const p of SHARE_PLATFORMS) {
    const mark = SHARE_MARKS[p];
    assert.ok(mark, `${p} has no mark`);
    assert.ok(mark.paths.length > 0, `${p} has no path data`);
    for (const d of mark.paths) {
      assert.ok(d.trim().length > 0, `${p} has an empty path`);
    }
  }
  assert.deepEqual(Object.keys(SHARE_MARKS).sort(), [...SHARE_PLATFORMS].sort());
});

/*
  The reason brand marks are allowed at all.

  Decision 121 refused them, and the reason it gave was that drawing them properly means
  hardcoding X black and Bluesky #0285FF, which would be the first literal colours in a
  codebase that has none and which fight fifteen of the sixteen themes. 128 reversed it on
  the condition that the marks take the row colour. This is that condition, asserted
  against the exported data rather than the file text, so the explanation above can name
  the hex value that must never appear in a path.
*/
test('no mark carries a colour of its own', () => {
  for (const p of SHARE_PLATFORMS) {
    for (const d of SHARE_MARKS[p].paths) {
      assert.ok(!/#|rgb\(|hsl\(|var\(/.test(d), `${p} path data carries a colour`);
    }
  }
});

test('copy link is the only mark that is not a brand mark', () => {
  assert.equal(SHARE_MARKS.copy.kind, 'stroked');
  for (const p of OUTBOUND_PLATFORMS) {
    assert.equal(SHARE_MARKS[p].kind, 'solid', `${p} should be a solid brand mark`);
  }
});

test('the mark component paints with currentColor and nothing else', () => {
  const mark = read('src/components/ShareMark.astro');
  assert.match(mark, /currentColor/);
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(mark), 'ShareMark.astro carries a hex colour');
  assert.ok(!/rgb\(|hsl\(/.test(mark), 'ShareMark.astro carries a colour function');
  assert.match(mark, /aria-hidden="true"/);
});

/*
  The defect decision 128 arrived with, kept out by a test rather than by memory.

  The copy button reports by swapping its own words to "Copied" and back on a timer. An
  element whose text is replaced wholesale loses every child it had, so once that button
  owns a mark, a swap written to the button deletes the icon on first press and the
  timeout restores the words without it. Nothing fails and nothing looks wrong. The
  control keeps working and quietly stops having an icon, once, for the readers who used
  it.

  The general rule is the part worth keeping: an element whose content is swapped on a
  timer cannot also be an element that owns children.
*/
test('the copy label swap targets a span rather than the button', () => {
  const menu = read('src/components/ShareMenu.astro');
  assert.match(menu, /class="copy-label"/);
  assert.ok(
    !/\bcopy\.textContent\s*=/.test(menu),
    'ShareMenu writes textContent to the copy button, which deletes the mark inside it'
  );
  assert.match(menu, /label\.textContent\s*=\s*'Copied'/);
  assert.match(menu, /label\.textContent\s*=\s*'Copy link'/);
});

test('the gate that would catch it is still asking the question', () => {
  const gate = read('scripts/check-share.mjs');
  /* Waits the revert out, because checking straight after the click passes either way. */
  assert.match(gate, /data-done/);
  assert.match(gate, /\.mk/);
  assert.ok(
    !/\bcopy\.textContent\s*=/.test(gate),
    'the gate resets the cloned button in the way the component must not'
  );
});
