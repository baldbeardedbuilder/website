/*
  Browser layout gate for the Type Stage shell.

  It measures the desktop and phone layouts that carry the most risk: the portrait stage,
  mobile navigation, editorial archive rows, and the article reading grid.
*/

import { chromium } from 'playwright';
import { serveDist } from './lib/serve-dist.mjs';
import { provenanceSuffix } from './lib/provenance.mjs';
import { firstArticlePage } from './lib/archetypes.mjs';

const { server, base } = await serveDist();
const browser = await chromium.launch();
const failures = [];
let measurements = 0;

const insideViewport = (box, width, label) => {
  if (box.left < -1 || box.right > width + 1) {
    failures.push(`${label} leaves the ${width}px viewport (${box.left.toFixed(1)} to ${box.right.toFixed(1)}).`);
  }
};

for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const home = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const doc = document.documentElement;
    const portrait = document.querySelector('.hero-person');
    const portraitStyle = portrait ? getComputedStyle(portrait) : null;
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      hero: box('.hero'),
      portrait: box('.hero-person'),
      latest: box('.hero-latest'),
      start: box('.start-grid'),
      topics: box('.topic-list'),
      footer: box('.site-footer'),
      menuDisplay: getComputedStyle(document.querySelector('.menu-button')).display,
      navDisplay: getComputedStyle(document.querySelector('.site-nav')).display,
      portraitVisible: portraitStyle?.visibility !== 'hidden' && portraitStyle?.display !== 'none'
    };
  });

  if (home.overflow > 1) failures.push(`home scrolls sideways by ${home.overflow}px at ${width}px.`);
  for (const [name, box] of Object.entries({
    hero: home.hero,
    latest: home.latest,
    start: home.start,
    topics: home.topics,
    footer: home.footer
  })) {
    if (!box || box.width <= 0 || box.height <= 0) {
      failures.push(`home ${name} has no measurable box at ${width}px.`);
      continue;
    }
    insideViewport(box, width, `home ${name}`);
    measurements++;
  }
  if (!home.portraitVisible || !home.portrait) {
    failures.push(`the Michael portrait is hidden at ${width}px.`);
  } else {
    const visibleWidth = Math.min(home.portrait.right, width) - Math.max(home.portrait.left, 0);
    if (visibleWidth / home.portrait.width < 0.75) {
      failures.push(`less than 75% of the Michael portrait remains visible at ${width}px.`);
    }
    measurements++;
  }

  if (width === 1280) {
    if (home.menuDisplay !== 'none') failures.push('the mobile menu button is visible on desktop.');
    if (home.navDisplay === 'none') failures.push('the primary navigation is hidden on desktop.');
  } else {
    if (home.menuDisplay === 'none') failures.push('the mobile menu button is hidden at 390px.');
    await page.locator('.menu-button').click();
    const menu = await page.locator('.site-nav').evaluate((nav) => {
      const rect = nav.getBoundingClientRect();
      const links = [...nav.querySelectorAll('a')].map((link) => {
        const box = link.getBoundingClientRect();
        return { text: link.textContent.trim(), height: box.height };
      });
      return { display: getComputedStyle(nav).display, left: rect.left, right: rect.right, links };
    });
    if (menu.display === 'none') failures.push('the mobile menu did not open at 390px.');
    insideViewport(menu, width, 'mobile menu');
    for (const link of menu.links) {
      if (link.height < 44) failures.push(`mobile navigation link "${link.text}" is only ${link.height.toFixed(1)}px tall.`);
      measurements++;
    }
  }

  await page.close();
}

for (const [label, path] of [
  ['articles', '/articles/'],
  ['videos', '/videos/'],
  ['topics', '/topics/'],
  ['topic', '/csharp/']
]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + path, { waitUntil: 'networkidle' });
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const rows = [...document.querySelectorAll('.archive-row, .topic-directory a')].map((row) => {
      const box = row.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, height: box.height };
    });
    return { overflow: doc.scrollWidth - doc.clientWidth, rows };
  });
  if (result.overflow > 1) failures.push(`${label} scrolls sideways by ${result.overflow}px at 390px.`);
  if (result.rows.length === 0) failures.push(`${label} has no archive or directory rows to measure.`);
  for (const row of result.rows) {
    insideViewport(row, 390, `${label} row`);
    if (row.width <= 0 || row.height < 44) failures.push(`${label} has a collapsed row at 390px.`);
    measurements++;
  }
  await page.close();
}

const [[, articlePath] = []] = firstArticlePage();
if (!articlePath) {
  failures.push('no article page was found for the reading layout check.');
} else {
  for (const width of [1200, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(base + articlePath, { waitUntil: 'networkidle' });
    const reading = await page.evaluate(() => {
      const doc = document.documentElement;
      const selectors = ['.story-head-inner', '.detail-shell', '.detail-rail', '.story'];
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        boxes: selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return { selector, box: null };
          const box = element.getBoundingClientRect();
          return { selector, box: { left: box.left, right: box.right, width: box.width, height: box.height } };
        })
      };
    });
    if (reading.overflow > 1) failures.push(`article scrolls sideways by ${reading.overflow}px at ${width}px.`);
    for (const { selector, box } of reading.boxes) {
      if (!box || box.width <= 0 || box.height <= 0) {
        failures.push(`article ${selector} has no measurable box at ${width}px.`);
        continue;
      }
      insideViewport(box, width, `article ${selector}`);
      measurements++;
    }
    await page.close();
  }
}

await browser.close();
server.close();

if (failures.length) {
  console.error('\nlayout problems:\n');
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}

console.log(`layout clean across ${measurements} Type Stage measurements.${provenanceSuffix()}`);
