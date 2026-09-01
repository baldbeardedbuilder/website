/*
  Nothing parked may reach the shipped site.

  Runs after astro build, in the same job, because it reads dist.

  Pagefind fragments are gzipped JSON, so this decompresses them and reads the indexed
  urls rather than grepping the bytes. Grepping would have quietly passed forever.
*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { provenanceSuffix } from './lib/provenance.mjs';

const DIST = 'dist';

/*
  Route segments that must not ship. Add to this when a feature is parked, and delete the
  entry in the same commit that unparks it.
*/
const PARKED = [
  { route: 'report', why: 'Problem reports are retired.' }
];

const problems = [];

if (!fs.existsSync(DIST)) {
  console.error('dist is missing. Run astro build first.');
  process.exit(1);
}

/* 1. The route itself, as a built page. */
const pages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full.replaceAll('\\', '/'));
  }
};
walk(DIST);

for (const { route, why } of PARKED) {
  for (const p of pages) {
    if (p === `${DIST}/${route}/index.html` || p === `${DIST}/${route}.html`) {
      problems.push(`${p} was built. ${why}`);
    }
  }
}

/* 2. The sitemap, which is generated and so never read by a person. */
const sitemaps = fs.readdirSync(DIST).filter((f) => f.startsWith('sitemap') && f.endsWith('.xml'));
for (const file of sitemaps) {
  const xml = fs.readFileSync(path.join(DIST, file), 'utf8');
  for (const { route, why } of PARKED) {
    if (new RegExp(`<loc>[^<]*/${route}/?</loc>`).test(xml)) {
      problems.push(`${file} lists /${route}/. ${why}`);
    }
  }
}

/* 3. A sitemap entry and a noindex meta on the same page are contradictory instructions. */
const sitemapUrls = [];
for (const file of sitemaps) {
  const xml = fs.readFileSync(path.join(DIST, file), 'utf8');
  // The index file points at the others. Its entries are sitemaps, not pages.
  if (xml.includes('<sitemapindex')) continue;
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.push(new URL(m[1]).pathname);
}

for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  if (!/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) continue;
  const route = '/' + path.relative(DIST, p).replaceAll('\\', '/').replace(/index\.html$/, '');
  if (sitemapUrls.includes(route)) {
    problems.push(
      `${route} says noindex in its own markup and is listed in the sitemap. ` +
        `The sitemap asks a crawler to index it and the page tells it not to.`
    );
  }
}

/* 4. The Pagefind index, which is the one that would have been missed. */
const fragmentDir = path.join(DIST, 'pagefind', 'fragment');
let indexed = 0;
if (fs.existsSync(fragmentDir)) {
  for (const file of fs.readdirSync(fragmentDir)) {
    const raw = fs.readFileSync(path.join(fragmentDir, file));
    let text;
    try {
      text = zlib.gunzipSync(raw).toString('utf8');
    } catch {
      problems.push(`${file} is not gzipped JSON. Pagefind changed its format, so this check is blind.`);
      continue;
    }
    const url = text.match(/"url"\s*:\s*"([^"]+)"/)?.[1];
    if (!url) continue;
    indexed++;
    for (const { route, why } of PARKED) {
      if (url === `/${route}/` || url === `/${route}`) {
        problems.push(`Pagefind indexed ${url}. ${why}`);
      }
    }
  }
} else {
  problems.push('dist/pagefind/fragment is missing, so the search index was not checked at all.');
}

if (problems.length) {
  console.error(`\n${problems.join('\n')}\n`);
  process.exit(1);
}

console.log(
  `dist is clean of ${PARKED.length} parked route(s) across ${pages.length} pages, ` +
    `${sitemaps.length} sitemap file(s) with ${sitemapUrls.length} urls, and ` +
    `${indexed} indexed documents.` +
    provenanceSuffix()
);
