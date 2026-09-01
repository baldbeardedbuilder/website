/*
  Email is one feature with several locks. These assertions keep the migration, stored
  preferences, unsubscribe route, production guard and schedule from drifting apart.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(ROOT, ...parts));

test('the queue migration and unsubscribe route are active together', () => {
  assert.ok(exists('supabase', 'migrations', '20260806000000_notifications.sql'));
  assert.ok(exists('src', 'pages', 'unsubscribe.astro'));
  assert.equal(exists('supabase', 'deferred', '20260801000100_notifications.sql'), false);
  assert.equal(exists('src', 'pages', '_unwired', 'unsubscribe.astro'), false);
});

test('retired account preferences stay stored without exposing account settings', () => {
  const account = read('src', 'lib', 'account.ts');

  for (const field of ['story_published', 'story_featured', 'comment_reply']) {
    assert.ok(account.includes(field), `account.ts does not persist ${field}`);
  }
  assert.equal(exists('src', 'pages', 'account.astro'), false);
});

test('delivery requires the explicit flag and API key', () => {
  const mail = read('src', 'lib', 'mail.ts');
  assert.ok(mail.includes("MAIL_DELIVERY_ENABLED) === 'true'"));
  assert.ok(mail.includes('RESEND_API_KEY'));
  assert.ok(mail.includes('Idempotency-Key'));
});

test('the queue uses claims and the scheduled function runs every five minutes', () => {
  const migration = read('supabase', 'migrations', '20260806000000_notifications.sql');
  const schedule = read('netlify', 'functions', 'drain-notifications.mts');

  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /claim_token/i);
  assert.match(migration, /interval '48 hours'/i);
  assert.ok(schedule.includes("schedule: '*/5 * * * *'"));
  assert.ok(schedule.includes('NOTIFY_SECRET'));
});

/*
  Astro's checkOrigin guard is on by default and answers an on demand POST with no
  matching origin with a 403 before the route runs. A plain server to server fetch sends
  no origin, so the drain was refused at the edge on every scheduled run while the route
  itself was correct. The route cannot assert this for itself: its own failure mode is
  404, so nothing downstream notices the guard.
*/
test('the scheduled drain satisfies the CSRF origin guard it POSTs through', () => {
  const schedule = read('netlify', 'functions', 'drain-notifications.mts');
  const config = read('astro.config.mjs');

  assert.match(schedule, /Origin: endpoint\.origin/);
  assert.match(schedule, /'Content-Type': 'application\/json'/);
  assert.equal(
    /checkOrigin\s*:\s*false/.test(config),
    false,
    'the origin guard was turned off site wide instead of the drain being fixed'
  );
});

test('the email trigger does not duplicate the Featured badge grant', () => {
  const featured = read('supabase', 'migrations', '20260801000000_featured.sql');
  const notifications = read('supabase', 'migrations', '20260806000000_notifications.sql');

  assert.ok(featured.includes('grant_featured_badge'));
  assert.equal(/insert into public\.badge_grants/i.test(notifications), false);
});

test('browser unsubscribe confirms while RFC one-click POST is immediate', () => {
  const page = read('src', 'pages', 'unsubscribe.astro');
  assert.ok(page.includes("Astro.request.method === 'POST'"));
  assert.ok(page.includes("form.get('List-Unsubscribe') === 'One-Click'"));
  assert.ok(page.includes('Turn this email off?'));
  assert.ok(page.includes('unsubscribe_by_token'));
});

test('the drain rechecks queued stories and skips retired reply notifications', () => {
  const notifications = read('src', 'lib', 'notifications.ts');

  assert.match(notifications, /\.from\('disasters'\)[\s\S]*?disaster\.status !== 'published'/);
  assert.doesNotMatch(notifications, /\.from\('comments'\)/);
  assert.ok(notifications.includes("last_error: 'skipped: comments retired'"));
});
