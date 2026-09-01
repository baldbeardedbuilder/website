/*
  The lead card on the front page always has something to say.

  The widest slot on the homepage holds a thumbnail, a two line title and a meta line. With
  no summary between them the card is mostly empty, and no layout change fixes that because
  the missing thing is words. Dropping aspect-ratio on the thumb was measured as an answer
  and it cuts 30.8 percent off the picture while leaving the summary gap at exactly the size
  it already was. See the .card.wide note in src/styles/app.css.

  So the rule is about content: the lead is the first Start here pick that has a summary,
  and a bare pick moves down the rail rather than putting a hole on the front page.

  Two of these read the built page rather than the source, because what matters is the
  paragraph a visitor sees, not the code that was supposed to produce it. They skip when
  dist is absent so a quick local run still works, and REQUIRE_DIST turns that skip into a
  failure on the CI step that follows the build. Four redirect tests once skipped on every
  CI run for their whole life while reporting green, which is the reason that flag exists.

  Run after: pnpm build
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hasBuild = fs.existsSync(path.join(DIST, 'index.html'));

if (!hasBuild && process.env.REQUIRE_DIST) {
  throw new Error(
    'REQUIRE_DIST is set but dist is missing, so these tests would silently skip. ' +
      'This step is meant to run after pnpm build.'
  );
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const starters = read(path.join('src', 'lib', 'starters.ts'));
const content = read(path.join('src', 'lib', 'content.ts'));
const index = read(path.join('src', 'pages', 'index.astro'));

/* The first Start here card is the video. Pull it out of the built markup and look inside it. */
function leadCard() {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const open = html.indexOf('start-watch');
  assert.notEqual(open, -1, 'no Start here video card was built on the homepage');
  const start = html.lastIndexOf('<', open);
  /*
    Cards are anchors and do not nest, so the next closing tag of the same kind ends it.
    Matching on </a> rather than counting depth keeps this readable and is safe here.
  */
  const end = html.indexOf('</a>', start);
  assert.notEqual(end, -1, 'the lead card never closed');
  return html.slice(start, end);
}

test('the lead card on the built homepage has a summary', { skip: !hasBuild }, () => {
  const card = leadCard();
  const p = card.match(/<p[^>]*>([\s\S]*?)<\/p>/);
  assert.ok(p, 'the lead card drew no paragraph at all, so it is a title over a meta line');

  const words = p[1].replace(/<[^>]+>/g, '').trim();
  assert.ok(
    words.length > 40,
    `the lead card's summary is ${words.length} characters, which is not a summary. ` +
      'Add a blurb to the first Start here pick in src/config/site.ts.'
  );
});

test('the lead card still draws its thumbnail and its meta line', { skip: !hasBuild }, () => {
  const card = leadCard();
  assert.match(card, /<img/, 'the lead card lost its thumbnail');
  assert.match(card, /Watch this first/, 'the lead card lost its meta line');
});

test('the lead is chosen by having prose, not by being first', () => {
  assert.match(
    starters,
    /findIndex\(hasSummary\)/,
    'starterItems no longer picks the lead by looking for a summary, so a bare first ' +
      'pick would go straight into the wide card'
  );
  assert.match(
    starters,
    /resolved\.unshift\(lead\)|ready\.unshift\(lead\)/,
    'the chosen lead is no longer moved to the front of the rail'
  );
});

test('a rail with nothing to say fails the build rather than drawing a hole', () => {
  assert.match(
    starters,
    /if \(leadIndex === -1\)[\s\S]{0,80}throw new Error/,
    'starterItems no longer throws when no pick has a summary. Returning the picks ' +
      'unchanged would put an empty card in the widest slot on the site.'
  );
});

test('an authored line wins over whatever the collection supplied', () => {
  assert.match(
    starters,
    /picks\[n\]\.blurb \?\? item\.description/,
    'the blurb is no longer preferred over the item description'
  );
});

/*
  Nothing in the rail is unpublished.

  This reads the built pages rather than the source, because the thing that matters is
  whether a visitor is being handed something that is not published yet. Every card in the
  rail is followed to the page it points at, and a draft page says so itself through the
  robots meta the layout writes for it.

  The count assertion at the end is the point of the test as much as the loop is. A regex
  that quietly matches nothing passes every assertion inside a loop that never runs, which
  is a green test asserting zero. That has already happened twice on this branch.
*/
test('no Start here card points at an unpublished page', { skip: !hasBuild }, () => {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

  const heading = html.indexOf('start-grid');
  assert.notEqual(heading, -1, 'the Start here heading is gone from the homepage');
  /* The rail ends where the next section heading begins. */
  const next = html.indexOf('<h2', heading + 12);
  const rail = html.slice(heading, next === -1 ? html.length : next);

  const hrefs = [...rail.matchAll(/<a class="start-[^"]*" href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(
    hrefs.length >= 2,
    `only ${hrefs.length} cards were found in the Start here rail, so this test is ` +
      'checking almost nothing. The card markup or the rail boundary has changed.'
  );

  let checked = 0;
  for (const href of hrefs) {
    /* A video with no page on this site links to YouTube. There is nothing here to read. */
    if (!href.startsWith('/')) continue;

    const file = path.join(DIST, href.replace(/^\/|\/$/g, ''), 'index.html');
    assert.ok(fs.existsSync(file), `the Start here rail links to ${href}, which was not built`);

    const page = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      page,
      /<meta[^>]+name="robots"[^>]+noindex/i,
      `the Start here rail is handing somebody ${href}, and that page tells search engines ` +
        'not to index it. A dated item is a draft until its date passes. Remove it from ' +
        'START_HERE in src/config/site.ts or wait for it to publish.'
    );
    checked += 1;
  }

  assert.ok(checked > 0, 'every card in the rail was offsite, so no page was actually read');
});

test('an unpublished pick fails the build rather than being dropped', () => {
  /*
    This used to assert that starterItems filtered drafts out of the rail. Decision 111
    moved the rule down into itemsByKeys and turned it from a filter into a throw, so the
    assertion moved with it. The behaviour being protected is the same one: the rail must
    never be quietly one card short because something has not published.
  */
  assert.match(
    content,
    /if \(found\.draft\)[\s\S]{0,400}throw new Error/,
    'itemsByKeys no longer throws on an unpublished pick, so a curated list can silently ' +
      'lose a card again. That is the defect decision 111 was written for.'
  );
  assert.match(
    content,
    /Curated pick[\s\S]{0,200}has not published/,
    'the unpublished pick error no longer says what went wrong in words somebody can act on'
  );
  assert.doesNotMatch(
    starters,
    /filter\(\(item\) => !item\.draft\)/,
    'starterItems is filtering drafts again. Under decision 111 they cannot reach it, so a ' +
      'filter here is either dead code or a sign the throw was weakened.'
  );
  assert.match(
    starters,
    /ready\.length < 2[\s\S]{0,120}throw new Error/,
    'the floor is gone, so a rail trimmed below two cards would build'
  );
});

test('the homepage resolves the rail through starterItems', () => {
  assert.match(
    index,
    /starters = await starterItems\(\)/,
    'index.astro no longer calls starterItems, so the lead rule is not applied'
  );
  assert.doesNotMatch(
    index,
    /START_HERE\[\s*n\s*\]/,
    'index.astro is mapping blurbs by array position again, which bypasses the lead rule'
  );
});
