/*
  Taxonomy, generated once and then hand reviewed.

  Decision 20 gives the site eleven topics and decision 18 makes URLs topic first, which
  means every article and video needs exactly one owning topic. The content submodule is
  read only from this repo and videos carry no tags at all, so the map lives here.

  This script produces a starting point, not an answer. It scores each item against a
  keyword table, writes the winner as primaryTopic and any runner up above the threshold
  as alsoFiled, and marks anything it is not confident about so a human can look at it.
  Rerunning it never overwrites a decision that has been reviewed: entries already marked
  reviewed in the existing taxonomy.json are carried through untouched.

  Run: pnpm taxonomy
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import YAML from 'yaml';
import { readJsonFile, writeJsonFileAtomic } from './lib/json-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'src', 'content');
const OUT = path.join(ROOT, 'src', 'config', 'taxonomy.json');
const OVERRIDES = path.join(ROOT, 'src', 'config', 'taxonomy.overrides.json');

/*
  Weighted keyword table. Tags count for more than titles because a tag was a deliberate
  act and a title word can be incidental. The order inside each topic does not matter.
*/
const SIGNALS = {
  csharp: {
    tags: ['csharp', 'c#', 'dotnet', 'linq', 'nuget', 'benchmark', 'algorithms', 'automapper'],
    words: [
      'c#', 'csharp', '.net', 'dotnet', 'linq', 'nuget', 'nullable', 'record',
      'pattern matching', 'generic', 'nameof', 'typeof', 'gettype', 'sealed',
      'partial', 'virtual', 'override', 'parallel', 'span', 'allocat', 'immutab',
      'primary constructor', 'alias any type', 'garbage collect', 'stack vs',
      'heap', 'boxing', 'struct', 'enum', 'interface', 'extension method',
      'async', 'await', 'task', 'threading', 'delegate', 'lambda', 'yield',
      'var keyword', 'tolower', 'string', 'performance', 'benchmark', 'httpclient',
      'serializ', 'reflection', 'attribute', 'operator', 'tuple', 'dispose',
      'idisposable', 'exception', 'switch expression', 'collection', 'array',
      'list<', 'dictionary', 'automapper', 'mediatr', 'polly', 'source generator'
    ]
  },
  aspnetcore: {
    tags: ['aspnet', 'aspnetcore', 'minimal-api', 'api', 'mvc', 'hateoas', 'microservices', 'graphql', 'apollo'],
    words: [
      'asp.net', 'aspnet', 'minimal api', 'web api', 'controller', 'middleware',
      'endpoint', 'routing', 'ivalidateoptions', 'model binding', 'hateoas',
      'vertical slice', 'dependency injection', 'timezoneinfo', 'signalr',
      'razor', 'health check', 'rate limit', 'cors', 'swagger', 'openapi',
      'authentication', 'authoriz', 'jwt', 'identity', 'rest api', 'graphql',
      'microservice', 'grpc', 'webhook'
    ]
  },
  data: {
    tags: ['efcore', 'entity-framework', 'sql', 'sqlite', 'server', 'fauna', 'faunadb', 'json', 'storage'],
    words: [
      'ef core', 'entity framework', 'dbcontext', 'onmodelcreating', 'repository pattern',
      'unit of work', 'sql server', 'sqlite', 'postgres', 'migration', 'query',
      'leftjoin', 'rightjoin', 'interceptor', 'audit logging', 'database', 'lazy loading',
      'eager loading', 'n+1', 'seed data', 'index', 'transaction', 'stored procedure',
      'dapper', 'supabase', 'mongodb', 'redis', 'cosmos'
    ]
  },
  'copilot-ai': {
    tags: ['ai', 'openai', 'machine-learning', 'whisper', 'copilot', 'mcp'],
    words: [
      'copilot', 'openai', 'chatgpt', 'whisper', 'llm', 'model context protocol',
      'sentiment analysis', 'speech recognition', 'ai agent', 'prompt', 'semantic kernel',
      'ollama', 'embedding', 'vector', ' ai ', 'ai-', 'machine learning',
      'voice coding', 'transcri'
    ]
  },
  windows: {
    tags: ['windows', 'powershell', 'visual-studio', 'terminal', 'avalonia', 'keyboard', 'font', 'setup', 'alias'],
    words: [
      'windows', 'powershell', 'winui', 'wpf', 'visual studio', 'terminal',
      'command alias', 'slnx', 'winget', 'wsl',
      'shortcut', 'keybind', 'snippet', 'debugger', 'breakpoint', 'profiler',
      'editor', 'theme', 'font', 'dev drive'
    ]
  },
  vscode: {
    tags: ['vscode', 'vs-code', 'visual-studio-code'],
    words: [
      'vs code', 'vscode', 'visual studio code', 'live share', 'remote containers',
      'rest client', 'peacock', 'prettier', 'bracket pair colorizer'
    ]
  },
  git: {
    tags: ['git', 'version-control'],
    words: [
      'git ', 'git stash', 'git clean', 'git switch', 'git cherry-pick', 'git rebase',
      'merge conflict', 'version control'
    ]
  },
  github: {
    tags: ['github', 'gist'],
    words: ['github', 'gist', 'pull request', 'github issues', 'github actions']
  },
  cloud: {
    tags: ['azure', 'docker', 'container', 'compose', 'serverless', 'functions', 'devops', 'netlify', 'app-service', 'key-vault', 'appveyor', 'octopus-deploy', 'linux', 'pipedream', 'twilio', 'vonage', 'opentok'],
    words: [
      'azure', 'aws', 'docker', 'container', 'kubernetes', 'serverless',
      'netlify', 'vercel', 'key vault', 'app service', 'deploy', 'ci/cd',
      'pipeline', 'github action', 'volume', 'cloud', 'hosting', 'cdn',
      'pipedream', 'twilio', 'zapier', 'lambda function', 'edge function'
    ]
  },
  'dev-life': {
    tags: [
      'oss', 'open-source', 'inclusion', 'diversity', 'parenting', 'family-values',
      'productivity', 'twitch', 'stream', 'livestream', 'coding', 'hacktoberfest',
      'code-of-conduct', 'contributions', 'polywork', 'woodworking', 'diy', 'desk',
      'hardware', 'developer-experience', 'testing', 'notion',
      'discord', 'nintendo', 'iot', 'raspberry-pi'
    ],
    words: [
      'live coding', 'stream', 'community', 'code of conduct', 'contributing',
      'girls who code', 'mother', 'lessons learned', 'desk', 'kiosk', 'raspberry pi',
      'inclusive', 'bias', '404 page', 'joy', 'career', 'burnout', 'imposter',
      'open source', 'maintainer', 'mentor',
      'interview', 'salary', 'remote work', 'productivity', 'notion', 'obsidian',
      'bongo cat', 'my setup', 'my desk', 'behind the scenes', 'why i ',
      'i tried', 'disaster', 'mistake', 'lesson'
    ]
  },
  blazor: {
    tags: ['blazor', 'wasm'],
    words: ['blazor', 'webassembly', 'render mode']
  }
};

const TAG_WEIGHT = 3;
const WORD_WEIGHT = 1;
/** Below this the item is flagged rather than silently filed under a guess. */
const CONFIDENCE_FLOOR = 3;
/** A runner up at least this fraction of the winner also gets listed as alsoFiled. */
const ALSO_FILED_RATIO = 0.5;

/**
 * Reserved top level paths. A topic can never be one of these and neither can anything
 * that would end up shadowing one. Kept in sync with RESERVED_SLUGS in src/config/site.ts
 * by tests/taxonomy.test.mjs rather than by importing across the ts boundary.
 */
const RESERVED = new Set([
  '404', 'about', 'blog', 'builders', 'conduct', 'dev-disasters', 'images',
  'kitchen-sink', 'privacy', 'rss.xml', 'search', 'settings',
  'sitemap-index.xml', 'submit', 'terms', 'uses', 'videos'
]);

/**
 * Article slugs already exist and are load bearing, so they are never regenerated.
 * Videos have never had a page, so their slug is derived from the title once and then
 * frozen here by the fact that taxonomy.json is committed.
 */
function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2018\u2019\u201c\u201d]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => typeof t === 'string')
    .map((t) => t.toLowerCase().trim())
    // Some entries in the back catalogue have body text bleeding into the tag list.
    // Anything with a space or a slash in it was never a real tag.
    .filter((t) => t && t.length <= 24 && !/[\s/]/.test(t));
}

function score(item) {
  const tags = new Set(item.tags);
  const haystack = `${item.title} ${item.description}`.toLowerCase();
  const scores = {};
  for (const [topic, signal] of Object.entries(SIGNALS)) {
    let s = 0;
    for (const t of signal.tags) if (tags.has(t)) s += TAG_WEIGHT;
    for (const w of signal.words) if (haystack.includes(w)) s += WORD_WEIGHT;
    scores[topic] = s;
  }
  return scores;
}

function classify(item) {
  const scores = score(item);
  const ranked = Object.entries(scores)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return { primaryTopic: 'dev-life', alsoFiled: [], confidence: 0, needsReview: true };
  }

  const [winner, top] = ranked[0];
  const alsoFiled = ranked
    .slice(1)
    .filter(([, s]) => s >= top * ALSO_FILED_RATIO)
    .map(([t]) => t)
    .slice(0, 2);

  // A tie at the top is a real editorial decision, not something to resolve by sort order.
  const tied = ranked.filter(([, s]) => s === top).length > 1;

  return {
    primaryTopic: winner,
    alsoFiled,
    confidence: top,
    needsReview: tied || top < CONFIDENCE_FLOOR
  };
}

function readCollection(name) {
  const dir = path.join(CONTENT, name);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .filter((f) => /\.(md|mdx)$/.test(f))
    .map((f) => {
      const parsed = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      return {
        collection: name,
        id: f.replace(/\.(md|mdx)$/, ''),
        title: String(parsed.data.title ?? ''),
        description: String(parsed.data.description ?? parsed.data.summary ?? ''),
        tags: normalizeTags(parsed.data.tags)
      };
    });
}

function readVideos() {
  const dir = path.join(CONTENT, 'videos');
  if (!fs.existsSync(dir)) return [];
  // Videos carry no tags and no description, so the title is the only signal there is.
  // That is exactly why so many of them come back flagged.
  return fs
    .readdirSync(dir)
    .sort()
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => {
      const v = YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8')) ?? {};
      return {
        collection: 'videos',
        id: String(v.id ?? f.replace(/\.ya?ml$/, '')),
        title: String(v.title ?? ''),
        description: '',
        tags: [],
        short: Boolean(v.short)
      };
    });
}

const existing = readJsonFile(OUT, { fallback: { entries: {} }, allowEmpty: true });
const overrides = readJsonFile(OVERRIDES, { fallback: { overrides: {} } }).overrides ?? {};

const items = [
  ...readCollection('blog'),
  // Brain dumps are deliberately absent. They are link roundups, they have never had a
  // published URL (/brain-dump/* has redirected to / for years), there is no mockup for
  // them and no nav home. v2 keeps that behaviour rather than inventing a page type.
  // Add readCollection('brainDumps') here the day a brain dump page gets designed.
  ...readVideos()
];

const entries = {};
let reviewed = 0;
let ai = 0;
let flagged = 0;

for (const item of items) {
  const key = `${item.collection}:${item.id}`;
  const prior = existing.entries?.[key];
  if (prior?.reviewed) {
    entries[key] = prior;
    reviewed++;
    continue;
  }

  const override = overrides[key];
  if (override) {
    ai++;
    entries[key] = {
      primaryTopic: override.primaryTopic,
      alsoFiled: override.alsoFiled ?? [],
      source: 'ai',
      reviewed: false,
      title: item.title,
      ...(override.note ? { note: override.note } : {})
    };
    continue;
  }

  const result = classify(item);
  if (result.needsReview) flagged++;
  entries[key] = {
    primaryTopic: result.primaryTopic,
    alsoFiled: result.alsoFiled,
    source: 'keyword',
    confidence: result.confidence,
    needsReview: result.needsReview,
    reviewed: false,
    title: item.title
  };
}

// Resolve the final URL for every item. Topic first per decision 18, so the owning
// topic and the slug together are the address. Articles keep the slug they already have
// because those URLs are live. Videos get one derived from the title.
//
// Two items can collide inside a topic, most likely a video that restates an article
// title. The loser takes a numeric suffix rather than either item silently vanishing,
// and the collision is printed so a better title can be chosen deliberately.
const taken = new Map();
const collisions = [];

// A topic serves /[topic]/articles/ and /[topic]/videos/ as filter views, so those two
// slugs are spoken for inside every topic before any content is placed.
const TOPIC_FILTERS = ['articles', 'videos'];
for (const topic of Object.keys(SIGNALS)) {
  for (const f of TOPIC_FILTERS) taken.set(`${topic}/${f}`, 'reserved filter view');
}

for (const item of items) {
  const key = `${item.collection}:${item.id}`;
  const entry = entries[key];
  const base = item.collection === 'videos' ? slugify(item.title) : item.id;
  let slug = base || key.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  const inTopic = `${entry.primaryTopic}/${slug}`;
  if (taken.has(inTopic)) {    collisions.push([key, taken.get(inTopic), inTopic]);
    let n = 2;
    while (taken.has(`${entry.primaryTopic}/${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  taken.set(`${entry.primaryTopic}/${slug}`, key);

  entry.slug = slug;
  entry.url = `/${entry.primaryTopic}/${slug}/`;
}

if (collisions.length > 0) {
  console.warn('slug collisions resolved with a numeric suffix:');
  for (const [a, b, at] of collisions) console.warn(`  ${at}  ${a} vs ${b}`);
}

// An override that points at nothing means content moved or an id was mistyped, and a
// silently ignored override is worse than a loud one.
const orphans = Object.keys(overrides).filter((k) => !entries[k]);
if (orphans.length > 0) {
  console.error('overrides that match no content item:');
  for (const o of orphans) console.error('  ' + o);
  process.exitCode = 1;
}

const TOPIC_IDS = new Set(Object.keys(SIGNALS));
const badTopics = Object.entries(entries).filter(
  ([, v]) => !TOPIC_IDS.has(v.primaryTopic) || v.alsoFiled.some((t) => !TOPIC_IDS.has(t))
);
if (badTopics.length > 0) {
  console.error('entries pointing at a topic that does not exist:');
  for (const [k] of badTopics) console.error('  ' + k);
  process.exitCode = 1;
}

const shadowed = [...TOPIC_IDS].filter((t) => RESERVED.has(t));
if (shadowed.length > 0) {
  console.error('topics that collide with a reserved top level path: ' + shadowed.join(', '));
  process.exitCode = 1;
}

const byTopic = {};
for (const e of Object.values(entries)) {
  byTopic[e.primaryTopic] = (byTopic[e.primaryTopic] ?? 0) + 1;
}

writeJsonFileAtomic(OUT, {
  $comment:
    'Generated by scripts/gen-taxonomy.mjs, then hand reviewed. Set reviewed to true ' +
    'on an entry and the generator will never touch it again.',
  entries
});

console.log(
  `${items.length} items: ${reviewed} human reviewed, ${ai} from the AI pass, ` +
    `${items.length - reviewed - ai} from keywords of which ${flagged} need a look\n`
);
for (const [topic, n] of Object.entries(byTopic).sort((a, b) => b[1] - a[1])) {
  console.log(String(n).padStart(4), topic);
}
console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
