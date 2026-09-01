/*
  No personal address reaches a reader.

  Decision 129. The site used to publish one contactEmail, michael@baldbeardedbuilder.com,
  and two pages consumed it. That is now two role addresses, coc@ for conduct and privacy@
  for data requests, so either can be handed to a moderator without a code change and the
  conduct inbox stays readable during an incident.

  A decision like that holds for about a week without a gate. The next page that needs
  somewhere to write is one edit away from a hardcoded mailto, and nothing in the build
  would notice, because a mailto with a real address in it is a working link.

  Two rules, and each covers the other's gap.

  Rule one is a closed set. Every address at our own domain must be one the site config
  declares. It is read out of site.ts rather than typed in here, so adding a role address
  is a one line change in one file and this gate follows it.

  Rule two is a shape test that ignores the domain entirely. Rule one is derived from
  site.ts, so an edit that puts michael@ back into site.ts would satisfy it: the address
  would be declared, and declared is all rule one asks. Rule two refuses a personal local
  part wherever it appears, including at a domain we do not own, which is what would catch
  mike@sparcapp.io if the submodule's workflow config ever found its way onto a page.

  Started from a real zero rather than an exclusion list. Measured across dist before this
  landed: three distinct addresses in the whole of the output, developer@example.com in a
  disaster story, versioning@github.com in a blog post, and the one personal address this
  decision removes. So there is nothing here being tolerated, and the count of permitted
  exceptions is zero.

  Addresses at other domains are left alone on purpose. Two of the three above arrived
  from the src/content submodule, which is read only from here, and decision 117 says a
  build must not go red over a content edit. Rule two still applies to them, because a
  personal address of Michael's in a post body is the same defect wherever it came from.
*/

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { provenanceSuffix } from './lib/provenance.mjs';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');
const SITE_CONFIG = path.join(ROOT, 'src', 'config', 'site.ts');
const MAIL_LIB = path.join(ROOT, 'src', 'lib', 'mail.ts');

/** The domain we control. Only addresses here are held to the closed set. */
const OWN_DOMAIN = 'baldbeardedbuilder.com';

/*
  Local parts that are a person rather than a role. Refused at any domain.

  Written as whole local parts and as a prefix test, because mike.jolley and
  michael-jolley are the same defect wearing a separator. A role address never starts
  with a first name, so the prefix test costs nothing real.
*/
const PERSONAL_LOCAL_PARTS = ['mike', 'michael', 'mjolley'];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/*
  Source files worth scanning as well as dist.

  Dist proves which addresses reach readers in the common path. Source catches addresses
  in server handlers and conditional states that the static output may not render.
*/
const SRC_DIRS = ['src/pages', 'src/components', 'src/config', 'src/lib'];

function isPersonal(localPart) {
  const lower = localPart.toLowerCase();
  return PERSONAL_LOCAL_PARTS.some(
    (name) => lower === name || lower.startsWith(`${name}.`) || lower.startsWith(`${name}-`)
  );
}

/** Reads the role addresses out of site.ts and mail.ts rather than restating them. */
function declaredAddresses() {
  const found = new Set();
  for (const file of [SITE_CONFIG, MAIL_LIB]) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(EMAIL)) found.add(match[0].toLowerCase());
  }
  return found;
}

function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

const declared = declaredAddresses();
const distFiles = walk(DIST, ['.html', '.xml', '.txt', '.json']);
const srcFiles = SRC_DIRS.flatMap((dir) =>
  walk(path.join(ROOT, dir), ['.astro', '.ts', '.tsx', '.json'])
);

if (distFiles.length === 0) {
  console.error('check:emails found no pages in dist. Run pnpm build first.');
  process.exit(1);
}
if (srcFiles.length === 0) {
  console.error('check:emails found no source files to scan. Refusing to report clean.');
  process.exit(1);
}

const failures = [];
const seen = new Map();

for (const file of [...distFiles, ...srcFiles]) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(EMAIL)) {
    const address = match[0].toLowerCase();
    const [localPart, domain] = address.split('@');
    if (!seen.has(address)) seen.set(address, rel);

    if (isPersonal(localPart)) {
      failures.push(`${rel}: ${address} is a person, not a role`);
      continue;
    }
    if (domain === OWN_DOMAIN && !declared.has(address)) {
      failures.push(`${rel}: ${address} is at ${OWN_DOMAIN} and site config does not declare it`);
    }
  }
}

/*
  Fail closed. Both role addresses belong on static pages, so the built output proves they
  reach the markup a reader receives.
*/
const distText = distFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

if (!distText.includes('privacy@baldbeardedbuilder.com')) {
  failures.push('dist publishes no privacy address, so this gate is not reading a real page');
}
if (!distText.includes('coc@baldbeardedbuilder.com')) {
  failures.push('dist publishes no conduct address, so the conduct inbox is unrouted');
}

if (failures.length) {
  console.error('check:emails found addresses that must not ship:\n');
  for (const line of failures) console.error(`  ${line}`);
  console.error(`\n${failures.length} problem(s). ${provenanceSuffix()}`);
  process.exit(1);
}

const others = [...seen.keys()].filter((a) => !a.endsWith(`@${OWN_DOMAIN}`));
console.log(
  `check:emails clean. ${seen.size} distinct address(es) across ${distFiles.length} built pages ` +
    `and ${srcFiles.length} source files, ${others.length} of them at other domains and left alone.` +
    provenanceSuffix()
);
