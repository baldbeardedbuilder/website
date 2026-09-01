/*
  Decision 129. Two role addresses, and no way back to one.

  check:emails scans for addresses that reach a reader, which covers every way this
  decision gets broken by adding something. It cannot cover the way it gets broken by
  adding nothing.

  An alias is the hole. Writing contactEmail: conductEmail into site.ts introduces no new
  address, publishes nothing, and passes an address scan cleanly, because there is only
  ever one string involved and it is a role address. It also undoes the decision entirely:
  the next page that needs somewhere to write takes the general name, and data requests
  land in the conduct inbox, which is the one inbox that has to stay readable during an
  incident. That is the exact routing 129 exists to prevent.

  So the alias is tested for by name here rather than by shape. A test that asks whether
  any key aliases another would be cleverer and would also pass on the day somebody spells
  it generalEmail.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = fs.readFileSync(path.join(ROOT, 'src', 'config', 'site.ts'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const CI = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

test('site config declares both role addresses', () => {
  assert.match(SITE, /conductEmail: 'coc@baldbeardedbuilder\.com'/);
  assert.match(SITE, /privacyEmail: 'privacy@baldbeardedbuilder\.com'/);
});

test('there is no general contact address to fall back on', () => {
  const code = SITE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(
    !/\bcontactEmail\b/.test(code),
    'site.ts declares a contactEmail. Decision 129 removed it and forbids an alias, ' +
      'because the next page that needs an address takes the general name and lands in ' +
      'whichever inbox it happens to point at.'
  );
});

test('site config publishes no personal address', () => {
  assert.ok(
    !/\b(mike|michael|mjolley)[.\-]?[a-z]*@/i.test(SITE),
    'site.ts names a personal address. Both site addresses have to be role addresses so ' +
      'either can be handed to a moderator without a code change.'
  );
});

test('both consuming pages read the address they are meant to', () => {
  const conduct = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'conduct.astro'), 'utf8');
  const privacy = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'privacy.astro'), 'utf8');
  assert.ok(conduct.includes('SITE.conductEmail'), 'conduct.astro must route to the conduct inbox');
  assert.ok(privacy.includes('SITE.privacyEmail'), 'privacy.astro must route to the privacy inbox');
  assert.ok(!conduct.includes('SITE.privacyEmail'), 'conduct requests must not go to the privacy inbox');
  assert.ok(!privacy.includes('SITE.conductEmail'), 'a data request must not go to the conduct inbox');
});

test('the gate is wired into package.json and into CI', () => {
  assert.equal(PKG.scripts['check:emails'], 'node scripts/check-emails.mjs');
  assert.ok(CI.includes('pnpm check:emails'), 'ci.yml must run check:emails');
});

test('the address gate reads source as well as dist', () => {
  const gate = fs.readFileSync(path.join(ROOT, 'scripts', 'check-emails.mjs'), 'utf8');
  assert.ok(gate.includes("'src/pages'"), 'check:emails must scan addresses in source');
  assert.ok(gate.includes('provenanceSuffix'), 'check:emails must name the tree it read');
});
