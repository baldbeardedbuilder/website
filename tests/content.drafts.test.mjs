/*
  The content API defaults to published.

  Decisions 110, 111 and 112, and the reason they are one test file rather than three.

  The defect was never a missing filter. It was an API whose safe behaviour had to be
  remembered by every caller: allItems() returned drafts, so each of six consumers had to
  add a filter on the way out. Four did, one wanted drafts on purpose, and one forgot, which
  put an unpublished post in the curated rail on the front page. A seventh consumer written
  next week would have had the same coin flip.

  So what is asserted here is the shape rather than the behaviour of any one caller. Names
  that hand out drafts have to say so, listings have to be clean without asking, and the
  function nobody calls is gone before somebody finds it and inherits the bug whole.

  This reads source rather than importing, because src/lib/content.ts imports astro:content,
  which only resolves inside a build.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const content = read(path.join('src', 'lib', 'content.ts'));

/* Every file that reads the catalogue, so a new consumer is caught by the census below. */
const consumers = [
  path.join('src', 'pages', 'all.astro'),
  path.join('src', 'pages', 'index.astro'),
  path.join('src', 'pages', 'videos.astro'),
  path.join('src', 'pages', 'rss.xml.js'),
  path.join('src', 'lib', 'starters.ts')
];

test('allItems returns published items only', () => {
  assert.match(
    content,
    /export async function allItems\(\)[\s\S]{0,200}filter\(\(i\) => !i\.draft\)/,
    'allItems() is handing out drafts again. Decision 110 makes published the default so ' +
      'that a listing written later is right without knowing the rule exists.'
  );
});

test('wanting drafts requires a name that says so', () => {
  assert.match(
    content,
    /export async function allItemsIncludingDrafts\(\)/,
    'the drafts-included reader has been renamed or removed. The point of decision 110 is ' +
      'that the dangerous call is spelled out at the call site.'
  );
});

test('the surfaces that build pages are the only ones taking drafts', () => {
  /*
    pagedItems feeds getStaticPaths, and a draft has a real page so it can be previewed
    before its date. itemsByKeys resolves curated picks. Both are lookups or path builders
    rather than listings.
  */
  const callers = [...content.matchAll(/allItemsIncludingDrafts\(\)/g)];

  /* One definition plus one call each from pagedItems and itemsByKeys. */
  assert.equal(
    callers.length,
    3,
    `allItemsIncludingDrafts() is referenced ${callers.length} times in content.ts, not 3. ` +
      'A new caller has to justify itself here: listings do not take drafts, only page ' +
      'builders and lookups do.'
  );
  assert.match(content, /pagedItems\(\)[\s\S]{0,160}allItemsIncludingDrafts\(\)/);
});

test('no consumer filters drafts by hand any more', () => {
  /*
    A leftover filter is not harmless. It is the thing that made the original defect
    invisible: when four callers filter and two do not, the two look like an oversight
    somebody will spot rather than a rule nobody wrote down.
  */
  for (const file of consumers) {
    const src = read(file);
    assert.doesNotMatch(
      src,
      /!\s*i(tem)?\.draft/,
      `${file} still filters drafts by hand. Under decision 110 allItems() has already done ` +
        'it, so this is either dead code or a caller reaching past the default.'
    );
  }
});

test('itemsByKeys separates a key nobody can find from one that has not published', () => {
  assert.match(
    content,
    /No content item with key/,
    'the typo error is gone, so a mistyped curated key would resolve as undefined'
  );
  assert.match(
    content,
    /Curated pick[\s\S]{0,300}Remove it from src\/config\/site\.ts/,
    'the unpublished pick error no longer tells anybody what to do about it. Decision 111 ' +
      'is only worth having if the failure names the pick, its date, and the fix.'
  );
  assert.match(
    content,
    /itemsByKeys[\s\S]{0,400}allItemsIncludingDrafts\(\)/,
    'itemsByKeys reads the published list, so an unpublished pick now reports as a key ' +
      'nobody can find. That blames a typo for a date and sends somebody hunting the ' +
      'wrong thing.'
  );
});

test('itemByUrl is gone', () => {
  /*
    Decision 112. Zero call sites and no draft filter, so the first person to reach for it
    would have inherited the original defect fully formed. Second dead export in two days
    but no call sites, which would let an unused helper's draft behaviour go unexamined.
  */
  assert.doesNotMatch(
    content,
    /itemByUrl/,
    'itemByUrl is back. If something genuinely needs a lookup by URL, give it the draft ' +
      'rule explicitly rather than restoring a function that never had one.'
  );
});
