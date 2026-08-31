/*
  Decision 19 as a test.

  Every old URL 301s exactly once, straight to a page that exists. The value here is not
  that the generator ran, it is that the destination is real and that nobody added a
  second hop by hand later.

  This runs against public/_redirects and against the set of pages the taxonomy says will
  exist. It deliberately does not need a build, so it can fail fast in CI before the
  slower build and axe stages.
*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taxonomy = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src', 'config', 'taxonomy.json'), 'utf8')
);
const raw = fs.readFileSync(path.join(ROOT, 'public', '_redirects'), 'utf8');

const parsed = raw
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const [from, to, status] = l.split(/\s+/);
    return { from, to, status };
  });

const explicit = parsed.filter((r) => !r.from.includes('*'));
const wildcards = parsed.filter((r) => r.from.includes('*'));

/** Pages v2 serves. Anything a redirect points at has to be in here. */
const pages = new Set([
  '/',
  '/about/',
  '/conduct/',
  '/dev-disasters/',
  '/privacy/',
  '/report/',
  '/search/',
  '/terms/',
  '/uses/',
  '/videos/',
  /*
    Articles only.

    A video's taxonomy url is where its page would be, not where a page is. A video page
    only exists when there is a video_pages row for it, per decision 22 and amendment 47,
    and this test cannot see the database. So a redirect pointing at a video url is a
    redirect that might land on a 404 depending on what somebody has written this week,
    which is not a redirect anybody should be allowed to write. Sending it to YouTube or
    to the topic feed is the answer, and the test below is what enforces that.
  */
  ...Object.entries(taxonomy.entries)
    .filter(([key]) => key.startsWith('blog:'))
    .map(([, e]) => e.url),
  ...Object.values(taxonomy.entries).map((e) => `/${e.primaryTopic}/`)
]);

test('every redirect has a source, a destination and a 301', () => {
  assert.ok(parsed.length > 100, `expected a full map, found ${parsed.length} rules`);
  for (const r of parsed) {
    assert.ok(r.from?.startsWith('/'), `bad source: ${JSON.stringify(r)}`);
    assert.ok(r.to?.startsWith('/'), `bad destination: ${JSON.stringify(r)}`);
    assert.equal(r.status, '301!', `${r.from} is not a forced 301`);
  }
});

test('no source appears twice', () => {
  const seen = new Set();
  const dupes = [];
  for (const r of parsed) {
    if (seen.has(r.from)) dupes.push(r.from);
    seen.add(r.from);
  }
  assert.deepEqual(dupes, [], `duplicate sources: ${dupes.join(', ')}`);
});

test('every destination is a page that exists', () => {
  const missing = explicit.filter((r) => !pages.has(r.to)).map((r) => `${r.from} -> ${r.to}`);
  assert.deepEqual(missing, [], `destinations that are not real pages:\n  ${missing.join('\n  ')}`);
});

test('no redirect points at a video page, which may not exist', () => {
  const videoUrls = new Set(
    Object.entries(taxonomy.entries)
      .filter(([key]) => key.startsWith('videos:'))
      .map(([, e]) => e.url)
  );
  const risky = explicit.filter((r) => videoUrls.has(r.to)).map((r) => `${r.from} -> ${r.to}`);
  assert.deepEqual(risky, [], `redirects to conditional video pages:\n  ${risky.join('\n  ')}`);
});

test('no redirect chains, a destination is never also a source', () => {
  const sources = new Set(explicit.map((r) => r.from));
  const chained = explicit
    .filter((r) => sources.has(r.to))
    .map((r) => `${r.from} -> ${r.to} -> ${explicit.find((x) => x.from === r.to)?.to}`);
  assert.deepEqual(chained, [], `chains found:\n  ${chained.join('\n  ')}`);
});

test('every destination carries a trailing slash, since the site is trailingSlash always', () => {
  const bare = explicit.filter((r) => !r.to.endsWith('/')).map((r) => r.to);
  assert.deepEqual(bare, [], `destinations missing a trailing slash: ${bare.join(', ')}`);
});

test('wildcards sit last so they can never shadow a specific rule', () => {
  const firstWildcardAt = parsed.findIndex((r) => r.from.includes('*'));
  const lastExplicitAt = parsed.map((r) => r.from.includes('*')).lastIndexOf(false);
  assert.ok(
    firstWildcardAt > lastExplicitAt,
    'a wildcard rule appears before an explicit rule and would shadow it'
  );
  assert.equal(wildcards.length, 2, 'only /brain-dump/* and /posts/* should be wildcards');
});

test('every article has a redirect from its old blog URL', () => {
  const sources = new Set(explicit.map((r) => r.from));
  const missing = Object.keys(taxonomy.entries)
    .filter((k) => k.startsWith('blog:'))
    .map((k) => `/blog/${k.slice(5)}/`)
    .filter((u) => !sources.has(u));
  assert.deepEqual(missing, [], `articles with no redirect:\n  ${missing.join('\n  ')}`);
});

test('renamed copilot topic URLs resolve without chains', () => {
  const rules = new Map(explicit.map((r) => [r.from, r.to]));
  const topicUrl = '/copilot-ai/';

  assert.equal(rules.get('/copilot/'), topicUrl);
  assert.equal(rules.get('/copilot'), topicUrl);

  for (const [key, entry] of Object.entries(taxonomy.entries)) {
    if (entry.primaryTopic !== 'copilot-ai') continue;
    const expected = key.startsWith('blog:') ? entry.url : topicUrl;
    assert.equal(rules.get(`/copilot/${entry.slug}/`), expected);
    assert.equal(rules.get(`/copilot/${entry.slug}`), expected);
  }
});

test('the legacy posts aliases measured on production are all still covered', () => {
  // Sampled from a live probe. If any of these stops redirecting, an inbound link that
  // works today starts 404ing.
  const live = [
    '/posts/stream-setup',
    '/posts/code-of-conduct-and-contributions-in-public-repositories',
    '/posts/using-automapper-with-dotnetcore-3',
    '/posts/adding-hateoas-to-an-aspnetcore-rest-api'
  ];
  const sources = new Set(explicit.map((r) => r.from));
  const missing = live.filter((u) => !sources.has(u));
  assert.deepEqual(missing, [], `live redirects that would break: ${missing.join(', ')}`);
});

test('no taxonomy URL collides with a reserved top level path', () => {
  const reserved = new Set([
    '404', 'about', 'blog', 'builders', 'conduct', 'dev-disasters', 'images',
    'kitchen-sink', 'privacy', 'report', 'rss.xml', 'search', 'settings',
    'sitemap-index.xml', 'submit', 'terms', 'uses', 'videos'
  ]);
  const clashes = Object.values(taxonomy.entries)
    .map((e) => e.url.split('/')[1])
    .filter((seg) => reserved.has(seg));
  assert.deepEqual([...new Set(clashes)], [], 'a topic shadows a reserved path');
});

test('no two items resolve to the same URL', () => {
  const seen = new Map();
  const dupes = [];
  for (const [key, e] of Object.entries(taxonomy.entries)) {
    if (seen.has(e.url)) dupes.push(`${e.url}: ${key} and ${seen.get(e.url)}`);
    seen.set(e.url, key);
  }
  assert.deepEqual(dupes, [], `duplicate URLs:\n  ${dupes.join('\n  ')}`);
});

/*
  The netlify.toml probe.

  scripts/verify-deploy.mjs asks a running deploy for one path and treats a 301 as proof
  that the root netlify.toml was read. That proof only holds while the path exists in
  exactly one place. If somebody adds it to _redirects, or a page appears at it, the probe
  starts passing for the wrong reason and stops being able to fail, which is worse than
  not having it: it would report the bbb.dev rule as loaded on a deploy where the file is
  being ignored.
*/
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const PROBE = '/_netlify-toml-is-read/';

test('the probe path is declared in netlify.toml', () => {
  assert.ok(
    toml.includes(`from = "${PROBE}"`),
    `${PROBE} is gone from netlify.toml. verify-deploy.mjs asserts it, and without the ` +
      'rule there is no way to tell a deploy that ignores netlify.toml from one that reads it.'
  );
});

test('the probe path is declared nowhere else, so a 301 can only mean netlify.toml', () => {
  assert.equal(
    parsed.some((r) => r.from === PROBE),
    false,
    `${PROBE} is in _redirects. That makes the probe self satisfying: it would 301 even ` +
      'on a deploy that never read netlify.toml, which is the exact failure it exists to catch.'
  );
  assert.equal(
    pages.has(PROBE),
    false,
    `${PROBE} is a real page now, so it would 200 rather than 301 and the probe would ` +
      'fail for a reason that has nothing to do with netlify.toml. Move the probe.'
  );
});

test('the probe lands on a page that exists', () => {
  const to = toml.match(/from = "\/_netlify-toml-is-read\/"\s*\n\s*to = "([^"]+)"/)?.[1];
  assert.ok(to, 'could not read the probe destination out of netlify.toml');
  assert.ok(
    pages.has(to),
    `the probe redirects to ${to}, which is not a page v2 serves. verify-deploy checks ` +
      'the landing page is a 200, so a missing destination fails the whole run.'
  );
});

/*
  The build settings netlify.toml now declares.

  These were inert while the file lived in public/, because a build cannot be configured
  by a file the build produces. At the repository root they are live, and netlify.toml
  wins over the Netlify UI for every key it declares. So the same versions are now pinned
  in two files, and the failure when they drift is a production build that runs on a
  different toolchain from every local run and every CI run, with nothing saying so.
*/
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('the Node version netlify builds with satisfies what package.json requires', () => {
  const declared = Number(toml.match(/NODE_VERSION = "(\d+)/)?.[1]);
  const required = Number(pkg.engines?.node?.match(/(\d+)/)?.[1]);

  assert.ok(declared, 'NODE_VERSION is gone from netlify.toml, so production picks its own');
  assert.ok(required, 'engines.node is gone from package.json');
  assert.ok(
    declared >= required,
    `netlify.toml builds on Node ${declared} and package.json needs at least ${required}`
  );
});

test('the pnpm version netlify builds with matches the one package.json pins', () => {
  /* packageManager is exact and PNPM_VERSION is a major. Both are honoured, so the only
     safe relationship is that the major agrees. Bumping one and not the other is the
     drift this catches. */
  const declared = toml.match(/PNPM_VERSION = "(\d+)/)?.[1];
  const pinned = pkg.packageManager?.match(/^pnpm@(\d+)/)?.[1];

  assert.ok(declared, 'PNPM_VERSION is gone from netlify.toml');
  assert.ok(pinned, 'packageManager is gone from package.json');
  assert.equal(
    declared,
    pinned,
    `netlify.toml says pnpm ${declared} and package.json pins ${pkg.packageManager}`
  );
});

test('the build command netlify runs is a script that exists', () => {
  const command = toml.match(/command = "pnpm ([\w:]+)"/)?.[1];
  assert.ok(command, 'no build command in netlify.toml, so production falls back to the UI');
  assert.ok(
    pkg.scripts?.[command],
    `netlify.toml runs "pnpm ${command}" and package.json has no ${command} script`
  );
});
