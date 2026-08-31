import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const config = read('src', 'config', 'site.ts');
const base = read('src', 'layouts', 'Base.astro');
const home = read('src', 'pages', 'index.astro');
const about = read('src', 'pages', 'about.astro');

test('page groups use their intended social images', () => {
  assert.match(config, /home: 'https:\/\/res\.cloudinary\.com\/.+\/ograph\/home_[^']+\.png'/);
  assert.match(config, /about: 'https:\/\/res\.cloudinary\.com\/.+\/ograph\/about_[^']+\.png'/);
  assert.match(config, /misc: 'https:\/\/res\.cloudinary\.com\/.+\/ograph\/misc_[^']+\.png'/);
  assert.match(base, /image = SOCIAL_IMAGES\.misc/);
  assert.match(home, /image=\{SOCIAL_IMAGES\.home\}/);
  assert.match(about, /image=\{SOCIAL_IMAGES\.about\}/);
});

test('Open Graph and Twitter publish the same large image', () => {
  assert.match(base, /property="og:image" content=\{socialImage\}/);
  assert.match(base, /property="og:image:alt" content=\{pageTitle\}/);
  assert.match(base, /name="twitter:image" content=\{socialImage\}/);
  assert.match(base, /name="twitter:image:alt" content=\{pageTitle\}/);
});
