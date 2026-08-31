import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const homepage = fs.readFileSync(path.join(root, 'src', 'pages', 'index.astro'), 'utf8');
const archive = path.join(root, 'src', 'pages', 'all.astro');
const portraits = ['point', 'think', 'shrug', 'shirt', 'laugh'];

test('homepage catalogue links open each public archive', () => {
  assert.match(homepage, /href="\/videos\/">Every video/);
  assert.match(homepage, /href="\/articles\/">Every article/);
  assert.match(homepage, /href="\/all\/">Everything I've made/);
  assert.ok(fs.existsSync(archive), 'the homepage links to /all/, but that archive page is missing');
});

test('rotating homepage portraits stay inside their image budgets', () => {
  for (const portrait of portraits) {
    const full = path.join(root, 'public', 'images', 'type-stage', `${portrait}.webp`);
    const mobile = path.join(root, 'public', 'images', 'type-stage', `${portrait}-800.webp`);

    assert.ok(fs.existsSync(full), `${portrait} has no full size portrait`);
    assert.ok(fs.existsSync(mobile), `${portrait} has no 800 pixel portrait`);
    assert.ok(fs.statSync(full).size <= 160_000, `${portrait} full size portrait is over 160 KB`);
    assert.ok(fs.statSync(mobile).size <= 45_000, `${portrait} mobile portrait is over 45 KB`);
  }
});
