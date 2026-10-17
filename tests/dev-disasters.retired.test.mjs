import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const absent = (...parts) => assert.equal(
  fs.existsSync(path.join(ROOT, ...parts)),
  false,
  `${parts.join('/')} should have been removed`
);

test('the dev disasters pages and feature modules stay removed', () => {
  for (const file of [
    ['src', 'pages', 'dev-disasters', '[...filter].astro'],
    ['src', 'pages', 'dev-disasters', '[slug].astro'],
    ['src', 'lib', 'disasters.ts'],
    ['src', 'lib', 'disaster-rows.ts'],
    ['src', 'lib', 'draft.ts'],
    ['src', 'lib', 'submissions.ts'],
    ['src', 'components', 'Teller.astro']
  ]) {
    absent(...file);
  }
});

test('the notification delivery endpoint and scheduled function stay removed', () => {
  absent('src', 'pages', 'api', 'notifications.ts');
  absent('src', 'pages', 'unsubscribe.astro');
  absent('src', 'lib', 'notifications.ts');
  absent('src', 'lib', 'notify-templates.ts');
  absent('src', 'lib', 'mail.ts');
  absent('netlify', 'functions', 'drain-notifications.mts');
});

test('the site no longer depends directly on the Netlify Functions SDK', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies?.['@netlify/functions'], undefined);
  assert.equal(pkg.devDependencies?.['@netlify/functions'], undefined);
});

test('the dormant database schema is retained without a site migration', () => {
  const migrations = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations'));
  assert.ok(migrations.some((file) => file.includes('notifications')));
  assert.ok(migrations.some((file) => file.includes('disaster')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src', 'lib', 'supabase', 'database.types.ts')));
});
