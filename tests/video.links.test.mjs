import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hasBuild = fs.existsSync(path.join(DIST, 'index.html'));

if (!hasBuild && process.env.REQUIRE_DIST) {
  throw new Error('REQUIRE_DIST is set but dist is missing, so video link behavior cannot be checked.');
}

const cardClasses = new Set(['fitem', 'row', 'card', 'shot']);

test('YouTube video cards open in a new browsing context', { skip: !hasBuild }, () => {
  const files = fs
    .readdirSync(DIST, { recursive: true })
    .filter((file) => typeof file === 'string' && file.endsWith('.html'));

  let checked = 0;

  for (const file of files) {
    const html = fs.readFileSync(path.join(DIST, file), 'utf8');
    for (const [tag] of html.matchAll(/<a\b[^>]*>/g)) {
      const className = tag.match(/\bclass="([^"]*)"/)?.[1] ?? '';
      const classes = className.split(/\s+/);
      const isCard = classes.some((name) => cardClasses.has(name));
      const isYouTube = /\bhref="https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(tag);

      if (!isCard || !isYouTube) continue;

      assert.match(tag, /\btarget="_blank"/, `${file} has a YouTube card that does not open separately`);
      assert.match(tag, /\brel="[^"]*\bnoopener\b[^"]*"/, `${file} is missing noopener`);
      assert.match(tag, /\brel="[^"]*\bnoreferrer\b[^"]*"/, `${file} is missing noreferrer`);
      checked += 1;
    }
  }

  assert.ok(checked > 0, 'no YouTube video cards were found in the built site');
});

test('shorts are labeled as their own content kind', { skip: !hasBuild }, () => {
  const html = fs.readFileSync(path.join(DIST, 'videos', 'index.html'), 'utf8');
  assert.match(html, /<span class="kind">Short \//);
});
