/*
  Decision 34 written down as a test rather than as a promise.

  This reparses the generated themes.css and recomputes every foreground token against
  all three surfaces using its own WCAG implementation, deliberately not importing the
  generator's math. An independent implementation is what makes this a check rather than
  a restatement, and it is what catches a hand edit to themes.css.

  Run: pnpm test
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'themes.css'), 'utf8');

const TARGET = 4.5;
const SURFACES = ['--bg', '--bg-raised', '--bg-inset'];
const FOREGROUNDS = [
  '--fg',
  '--fg-dim',
  '--accent',
  '--sev-error',
  '--sev-warn',
  '--sev-info',
  '--sev-hint',
  '--tok-key',
  '--tok-str',
  '--tok-fn',
  '--tok-type',
  '--tok-com',
  '--tok-num'
];

function srgbToLinear(channel) {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hexColor) {
  const n = parseInt(hexColor.slice(1), 16);
  const r = srgbToLinear((n >> 16) & 0xff);
  const g = srgbToLinear((n >> 8) & 0xff);
  const b = srgbToLinear(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseThemes(css) {
  const themes = new Map();
  const blockPattern = /\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g;
  let match;
  while ((match = blockPattern.exec(css)) !== null) {
    const [, id, body] = match;
    const vars = {};
    for (const line of body.split(';')) {
      const decl = line.trim();
      if (!decl.startsWith('--')) continue;
      const [name, value] = decl.split(':').map((s) => s.trim());
      vars[name] = value;
    }
    themes.set(id, vars);
  }
  return themes;
}

const themes = parseThemes(CSS);

test('themes.css defines at least sixteen themes', () => {
  assert.ok(themes.size >= 16, `found ${themes.size} themes`);
});

test('every color is a six digit hex, so nothing resolves at runtime', () => {
  for (const [id, vars] of themes) {
    for (const name of [...SURFACES, ...FOREGROUNDS]) {
      assert.match(
        vars[name] ?? '',
        /^#[0-9a-f]{6}$/,
        `${id} ${name} is "${vars[name]}"`
      );
    }
  }
});

test('every theme declares a color-scheme so form controls follow it', () => {
  for (const [id, vars] of themes) {
    const block = CSS.slice(CSS.indexOf(`[data-theme="${id}"]`));
    assert.match(
      block.slice(0, block.indexOf('}')),
      /color-scheme:\s*(dark|light)/,
      `${id} has no color-scheme`
    );
    assert.ok(vars['--line'], `${id} has no --line`);
  }
});

test('every foreground token clears 4.5 to 1 against all three surfaces', () => {
  const failures = [];
  for (const [id, vars] of themes) {
    for (const fg of FOREGROUNDS) {
      for (const bg of SURFACES) {
        const r = contrast(vars[fg], vars[bg]);
        if (r < TARGET) {
          failures.push(`${id}: ${fg} on ${bg} is ${r.toFixed(2)}:1`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n`);
});

test('Warning stays visually distinct from Error', () => {
  const hue = (hexColor) => {
    const n = parseInt(hexColor.slice(1), 16);
    const r = ((n >> 16) & 0xff) / 255;
    const g = ((n >> 8) & 0xff) / 255;
    const b = (n & 0xff) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    if (d === 0) return 0;
    let deg;
    if (mx === r) deg = ((g - b) / d) % 6;
    else if (mx === g) deg = (b - r) / d + 2;
    else deg = (r - g) / d + 4;
    return (deg * 60 + 360) % 360;
  };
  const gap = (a, b) => {
    const d = Math.abs(hue(a) - hue(b));
    return Math.min(d, 360 - d);
  };

  const failures = [];
  for (const [id, vars] of themes) {
    const g = gap(vars['--sev-error'], vars['--sev-warn']);
    // Hot Dog Stand has one hue to work with, so it is allowed to collapse. Every other
    // theme has to keep the two severities apart.
    if (id === 'hotdog-stand') continue;
    if (g < 20) failures.push(`${id}: error and warn are ${g.toFixed(0)} degrees apart`);
  }
  assert.deepEqual(failures, [], `\n${failures.join('\n')}\n`);
});
