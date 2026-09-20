import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'type-stage.css'), 'utf8');

const TARGET = 4.5;
const SURFACES = ['--bg', '--bg-raised', '--bg-inset'];
const FOREGROUNDS = [
  '--fg',
  '--fg-dim',
  '--fg-strong',
  '--sev-error',
  '--sev-warn',
  '--sev-info',
  '--sev-hint'
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

const root = CSS.match(/:root\s*\{([^}]+)\}/)?.[1];
assert.ok(root, 'type-stage.css must declare the site palette');
const vars = Object.fromEntries(
  [...root.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
);

function color(name, seen = new Set()) {
  assert.ok(!seen.has(name), `palette has a circular reference at ${name}`);
  seen.add(name);
  const value = vars[name];
  assert.ok(value, `palette is missing ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (reference) return color(reference[1], seen);
  assert.match(value, /^#[0-9a-f]{6}$/i, `${name} is not a color: ${value}`);
  return value;
}

test('the fixed palette declares a dark color scheme for form controls', () => {
  assert.match(root, /color-scheme:\s*dark;/);
  color('--line');
});

test('body and severity colors clear AA on the dark surfaces', () => {
  for (const fg of FOREGROUNDS) {
    for (const bg of SURFACES) {
      const ratio = contrast(color(fg), color(bg));
      assert.ok(ratio >= TARGET, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('article syntax colors clear AA on the black code surface', () => {
  assert.match(CSS, /\.story \.prose \.expressive-code pre\s*\{[^}]*background: var\(--black\)/);
  for (const token of ['--tok-key', '--tok-str', '--tok-fn', '--tok-type', '--tok-com', '--tok-num']) {
    const ratio = contrast(color(token), color('--black'));
    assert.ok(ratio >= TARGET, `${token} on --black is ${ratio.toFixed(2)}:1`);
  }
});

test('the light reading surface has AA text contrast', () => {
  assert.ok(contrast(color('--black'), color('--white')) >= TARGET);
});

test('Warning stays visually distinct from Error', () => {
  assert.notEqual(color('--sev-error'), color('--sev-warn'));
});
