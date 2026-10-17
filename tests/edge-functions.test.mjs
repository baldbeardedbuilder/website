import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isLikeTarget,
  isTargetKey,
  isTargetKind
} from '../supabase/functions/_shared/request.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(ROOT, file));

test('the Astro site has no runtime API routes or Netlify adapter', () => {
  for (const route of ['like.ts', 'comments.ts', 'share.ts']) {
    assert.equal(exists(`src/pages/api/${route}`), false, `${route} still runs in Astro`);
  }

  assert.doesNotMatch(read('astro.config.mjs'), /@astrojs\/netlify|adapter:/);
  assert.doesNotMatch(read('package.json'), /"@astrojs\/netlify"/);
});

test('Astro type checks exclude Deno function sources, which Deno checks separately', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.ok(config.exclude.includes('supabase/functions'));
});

test('each direct browser function call is configured for public invocation', () => {
  const config = read('supabase/config.toml');
  for (const name of ['like', 'comments', 'share']) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = false`));
  }

  const cors = read('supabase/functions/_shared/http.ts');
  assert.match(cors, /Access-Control-Allow-Origin': '\*'/);
  assert.match(cors, /OPTIONS/);
});

test('the edge request validators share the app target rules', () => {
  assert.equal(isTargetKind('content'), true);
  assert.equal(isTargetKind('comment'), false);
  assert.equal(isLikeTarget('comment'), true);
  assert.equal(isLikeTarget('disaster'), false);
  assert.equal(isTargetKey('blog:some-post'), true);
  assert.equal(isTargetKey('bad key'), false);
});

test('the static site calls the external functions without exposing a service key', () => {
  const api = read('src/lib/edge-api.ts');
  assert.match(api, /PUBLIC_SUPABASE_URL/);
  assert.match(api, /PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(api, /SUPABASE_SERVICE_ROLE_KEY|LIKE_IP_SECRET/);
  assert.match(read('src/components/islands/LikeButton.tsx'), /edgeFunctionUrl\('like'\)/);
});

test('the share beacon stays preflight-free and records only a bodyless intent response', () => {
  const menu = read('src/components/ShareMenu.astro');
  const endpoint = read('supabase/functions/share/index.ts');
  assert.match(menu, /type: 'text\/plain'/);
  assert.match(menu, /data-share-endpoint/);
  assert.match(endpoint, /return empty\(204\)/);
  assert.doesNotMatch(endpoint, /request\.method === 'GET'/);
});

test('Edge Functions use Supabase injected service keys and a rotatable IP secret', () => {
  const client = read('supabase/functions/_shared/client.ts');
  const request = read('supabase/functions/_shared/request.ts');
  assert.match(client, /SUPABASE_SECRET_KEYS/);
  assert.match(request, /Deno\.env\.get\('LIKE_IP_SECRET'\)/);
});
