/*
  The Type Stage reading surface uses one fixed palette. This gate checks the real cascade
  on an article, including contrast and the heading size hierarchy.
*/

import { chromium } from 'playwright';
import { serveDist } from './lib/serve-dist.mjs';
import { provenanceSuffix } from './lib/provenance.mjs';
import { firstArticlePage } from './lib/archetypes.mjs';

const parse = (css) => {
  const match = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!match) throw new Error(`cannot read colour from "${css}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};
const channel = (value) => {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};
const luminance = (color) => {
  const [red, green, blue] = color.map(channel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (left, right) => {
  const a = luminance(left);
  const b = luminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const [[articleLabel, articlePath] = []] = firstArticlePage();
if (!articlePath) {
  console.error('check:headings found no article page in dist.');
  process.exit(1);
}

const { server, base } = await serveDist();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];

try {
  const response = await page.goto(base + articlePath, { waitUntil: 'load' });
  if (!response || response.status() !== 200) {
    throw new Error(`${articleLabel} returned ${response ? response.status() : 'no response'}`);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const prose = document.querySelector('.prose');
    const probe = document.createElement('div');
    probe.id = 'heading-probe';
    probe.innerHTML = '<h2>Heading</h2><h3>Heading</h3><h4>Heading</h4><h5>Heading</h5><h6>Heading</h6><p>Prose</p>';
    prose.appendChild(probe);
  });

  const result = await page.evaluate(() => {
    const values = {};
    for (const level of ['h2', 'h3', 'h4', 'h5', 'h6', 'p']) {
      const style = getComputedStyle(document.querySelector(`#heading-probe ${level}`));
      values[level] = {
        color: style.color,
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
        family: style.fontFamily
      };
    }
    const surface = getComputedStyle(document.querySelector('.detail-shell')).backgroundColor;
    const real = document.querySelector('.prose > h2');
    return {
      values,
      surface,
      realH2: real ? getComputedStyle(real).color : null
    };
  });

  const background = parse(result.surface);
  for (const level of ['h2', 'h3', 'h4', 'h5', 'h6']) {
    const value = result.values[level];
    const ratio = contrast(parse(value.color), background);
    if (ratio < 4.5) failures.push(`${level} contrast is ${ratio.toFixed(2)}:1 on the reading surface.`);
    if (!value.family.includes('Anybody')) failures.push(`${level} does not use the Type Stage supporting display face.`);
  }

  if (!result.realH2) {
    failures.push(`${articleLabel} has no real prose h2 to compare with the probe.`);
  } else if (result.realH2 !== result.values.h2.color) {
    failures.push('the real prose h2 does not match the checked heading rule.');
  }

  const sizes = ['h2', 'h3', 'h4', 'h5', 'h6'].map((level) => result.values[level].size);
  for (let index = 1; index < sizes.length; index += 1) {
    if (sizes[index] > sizes[index - 1]) {
      failures.push(`h${index + 2} is larger than h${index + 1} on the reading surface.`);
    }
  }
  if (result.values.h2.weight < 700 || result.values.h3.weight < 700) {
    failures.push('the main prose headings are not visually stronger than the body.');
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('\ncheck:headings found Type Stage heading problems:\n');
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}

console.log(`Type Stage prose headings are clean on ${articleLabel}.${provenanceSuffix()}`);
