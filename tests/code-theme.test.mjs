import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import codeTheme from '../src/lib/code-theme.mjs';
import ecConfig from '../ec.config.mjs';
import { renderComment } from '../src/lib/markdown.ts';

const palette = fs.readFileSync(new URL('../src/styles/type-stage.css', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ci = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('all syntax scopes use variables supplied by the fixed palette', () => {
  assert.ok(codeTheme.tokenColors.length > 0);
  for (const rule of codeTheme.tokenColors) {
    const match = rule.settings.foreground.match(/^var\((--[\w-]+)\)$/);
    assert.ok(match, `scope ${rule.scope ?? 'default'} must use a palette variable`);
    assert.match(palette, new RegExp(`${match[1]}:\\s*[^;]+;`));
  }
  for (const token of ['key', 'str', 'fn', 'type', 'com', 'num']) {
    assert.ok(codeTheme.tokenColors.some((rule) => rule.settings.foreground === `var(--tok-${token})`));
  }
});

test('articles use one shared code theme without theme switching', () => {
  assert.equal(ecConfig.themes.length, 1);
  assert.equal(ecConfig.themes[0].name, codeTheme.name);
  assert.deepEqual(ecConfig.themes[0].settings, codeTheme.tokenColors);
  assert.equal(ecConfig.themes[0].fg, 'var(--fg)');
  assert.equal(ecConfig.themes[0].bg, 'var(--bg-inset)');
  assert.equal(ecConfig.themeCssSelector, false);
  assert.equal(ecConfig.useDarkModeMediaQuery, false);
});

test('rendering comment syntax keeps the shared source theme unchanged', async () => {
  const before = structuredClone(codeTheme);
  const html = await renderComment('```csharp\n// example\nvar name = "Mike";\n```');
  assert.match(html, /var\(--tok-com\)/);
  assert.match(html, /var\(--tok-str\)/);
  assert.deepEqual(codeTheme, before);
});

test('generation no longer produces themes and CI still checks rendered headings', () => {
  assert.doesNotMatch(pkg.scripts.gen, /themes/);
  assert.equal(pkg.scripts.themes, undefined);
  assert.doesNotMatch(pkg.scripts['gen:check'], /themes|heading-fallbacks/);
  assert.equal(pkg.scripts['check:headings'], 'node scripts/check-headings.mjs');
  assert.ok(ci.includes('pnpm check:headings'));
});
