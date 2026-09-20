/*
  Performance, best practices and SEO gate.

  axe covers the accessibility decision. This covers the rest of decision 32: a content
  page ships almost no JavaScript, loads fast on a throttled phone, and is indexable.
  Lighthouse is run against the built files rather than a dev server, because a dev server
  measures Vite rather than the site.

  Chrome comes from Playwright, which is already installed for the accessibility gate, so
  there is no second browser download and no dependence on whatever Chrome a CI image
  happens to ship.
*/

import { chromium } from 'playwright';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { serveDist } from './lib/serve-dist.mjs';
import { firstArticlePage, firstDisasterPage, firstVideoPage } from './lib/archetypes.mjs';
import { provenanceSuffix } from './lib/provenance.mjs';

const videoPages = firstVideoPage();

/* A smaller list than the accessibility gate because each run takes several seconds.
   Content-backed detail routes are discovered from dist so a content rename or a keyless
   CI build cannot turn the performance gate into a 404 audit. */
const PAGES = [
  ['home', '/'],
  ['topic index', '/csharp/'],
  ...firstArticlePage(),
  ...(videoPages.length ? videoPages : [['videos', '/videos/']]),
  ['disaster archive', '/dev-disasters/'],
  ...firstDisasterPage()
];

if (!PAGES.some(([label]) => label === 'article')) {
  console.error(
    'no article page was discovered in dist, so the most read page type went unaudited. ' +
      'Check src/config/taxonomy.json has entries and that pnpm build ran first.'
  );
  process.exit(1);
}

/* Axe owns accessibility and checks the page archetypes at phone and desktop widths. */
const THRESHOLDS = {
  performance: 0.95,
  'best-practices': 0.95,
  seo: 1
};

/*
  The one number that matters most on a content page, stated separately so a regression
  reads as "the homepage now ships 40 KB of script" rather than as a score drop.

  Two budgets, not one. Decision 32 says zero JavaScript by default on content pages, and
  a single shared ceiling would quietly let an island land on the homepage and still pass.
  The listing pages get a budget small enough that anything hydrating there fails, and the
  detail pages get room for the one island they are allowed to carry.
*/
const MAX_SCRIPT_BYTES = {
  home: 1_000,
  'topic index': 1_000,
  videos: 1_000,
  'disaster archive': 1_000,
  article: 30_000,
  video: 30_000,
  disaster: 30_000
};

const { server, base } = await serveDist();

/* chrome-launcher rather than Playwright's own launcher, because Lighthouse drives Chrome
   over a devtools port and Playwright drives it over a pipe. Letting chrome-launcher pick
   the port also avoids fighting whatever else on the machine is already sitting on 9222. */
const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu']
});

const failures = [];
const rows = [];

for (const [label, path] of PAGES) {
  const result = await lighthouse(base + path, {
    port: chrome.port,
    output: 'json',
    logLevel: 'error'
  });
  const lhr = result.lhr;

  const scores = {};
  for (const [key, min] of Object.entries(THRESHOLDS)) {
    const score = lhr.categories[key]?.score ?? 0;
    scores[key] = score;
    if (score < min) {
      const failed = Object.values(lhr.audits)
        .filter((a) => a.score !== null && a.score < 0.9 && a.title)
        .slice(0, 6)
        .map((a) => `${a.title} (${a.displayValue ?? a.score})`);
      failures.push(
        `${label} ${key} scored ${(score * 100).toFixed(0)}, needs ${min * 100}\n` +
          failed.map((t) => `      ${t}`).join('\n')
      );
    }
  }

  const scriptBytes = (lhr.audits['network-requests']?.details?.items ?? [])
    .filter((i) => (i.mimeType ?? '').includes('javascript'))
    .reduce((sum, i) => sum + (i.transferSize ?? 0), 0);

  const budget = MAX_SCRIPT_BYTES[label];
  if (budget !== undefined && scriptBytes > budget) {
    failures.push(`${label} ships ${scriptBytes} bytes of script, budget is ${budget}`);
  }

  rows.push(
    `  ${label.padEnd(18)} perf ${(scores.performance * 100).toFixed(0).padStart(3)}  ` +
      `bp ${(scores['best-practices'] * 100).toFixed(0).padStart(3)}  ` +
      `seo ${(scores.seo * 100).toFixed(0).padStart(3)}  ` +
      `js ${String(scriptBytes).padStart(6)} bytes`
  );
}

console.log('\n' + rows.join('\n') + '\n');

/* Chrome on Windows sometimes still holds its temporary profile directory open when
   chrome-launcher tries to delete it. That is cleanup, not a result, so it must never
   decide whether the gate passed. */
try {
  chrome.kill();
} catch (err) {
  console.warn(`Could not clean up the Chrome profile directory: ${err.message}`);
}
server.close();

if (failures.length) {
  console.error(`Lighthouse found ${failures.length} problems:\n`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

console.log(`Lighthouse clean across ${PAGES.length} pages.` + provenanceSuffix());
