import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const exists = (...parts) => fs.existsSync(path.join(ROOT, ...parts));
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const retiredRoutes = [
  ['src', 'middleware.ts'],
  ['src', 'pages', 'account.astro'],
  ['src', 'pages', 'signin.astro'],
  ['src', 'pages', 'submit.astro'],
  ['src', 'pages', 'builders', '[handle].astro'],
  ['src', 'pages', 'auth', 'callback.ts'],
  ['src', 'pages', 'auth', 'signin.ts'],
  ['src', 'pages', 'auth', 'signout.ts'],
  ['src', 'pages', 'auth', 'link', '[provider].ts'],
  ['src', 'pages', 'api', 'disasters.ts'],
  ['src', 'pages', 'api', 'report.ts'],
  ['src', 'pages', 'report.astro'],
  ['src', 'components', 'SubmissionList.astro'],
  ['src', 'components', 'islands', 'CommentThread.tsx']
];

test('retired account, submission, and report routes stay retired', () => {
  for (const route of retiredRoutes) {
    assert.equal(exists(...route), false, `${route.join('/')} is active again`);
  }
});

test('shared navigation and bylines do not link to retired account routes', () => {
  const footer = read('src', 'components', 'SiteFooter.astro');
  const teller = read('src', 'components', 'Teller.astro');

  assert.doesNotMatch(footer, /\/account\/|\/signin\/|\/builders\/|\/submit\//);
  assert.doesNotMatch(teller, /\/builders\//);
});

test('anonymous likes never attach retired account ids', () => {
  const like = read('src', 'pages', 'api', 'like.ts');

  assert.match(like, /toggleLike\(kind, key, token, ip, null\)/);
});

test('retired comment mutations return gone instead of asking for a sign in', () => {
  const comments = read('src', 'pages', 'api', 'comments.ts');

  assert.match(comments, /Comments are no longer available\.', 410/);
  assert.doesNotMatch(comments, /Sign in to/);
});
