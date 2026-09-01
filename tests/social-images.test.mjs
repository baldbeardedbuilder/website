import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assignContentSocialImages,
  buildContentSocialImage,
  splitSocialTitle
} from '../src/lib/social-images.ts';

const root = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const config = read('src', 'config', 'site.ts');
const base = read('src', 'layouts', 'Base.astro');
const home = read('src', 'pages', 'index.astro');
const about = read('src', 'pages', 'about.astro');
const detail = read('src', 'pages', '[topic]', '[slug].astro');
const taxonomy = JSON.parse(read('src', 'config', 'taxonomy.json'));

test('page groups use their intended social images', () => {
  assert.match(config, /home: 'https:\/\/res\.cloudinary\.com\/.+\/ograph\/home_[^']+\.png'/);
  assert.match(config, /about: 'https:\/\/res\.cloudinary\.com\/.+\/ograph\/about_[^']+\.png'/);
  assert.match(config, /misc: 'https:\/\/res\.cloudinary\.com\/.+\/ograph\/misc_[^']+\.png'/);
  assert.match(base, /image = SOCIAL_IMAGES\.misc/);
  assert.match(home, /image=\{SOCIAL_IMAGES\.home\}/);
  assert.match(about, /image=\{SOCIAL_IMAGES\.about\}/);
});

test('Open Graph and Twitter publish the same large image', () => {
  assert.match(base, /property="og:image" content=\{socialImage\}/);
  assert.match(base, /property="og:image:alt" content=\{pageTitle\}/);
  assert.match(base, /name="twitter:image" content=\{socialImage\}/);
  assert.match(base, /name="twitter:image:alt" content=\{pageTitle\}/);
});

test('content pages use encoded Cloudinary title and topic layers', () => {
  const image = buildContentSocialImage(
    {
      title: 'Five DI Anti-Patterns Haunting .NET Apps and how to fix Them',
      topics: ['Dependency Injection', 'C#']
    },
    3
  );

  assert.equal(
    image,
    'https://res.cloudinary.com/dk3rdh3yo/image/upload/' +
      'co_%23e83a47,l_text:Fira%20Mono_20:DEPENDENCY%20INJECTION%20%7C%20C%23/' +
      'fl_layer_apply,g_north_west,x_60,y_60/' +
      'w_630,c_fit,co_white,b_rgb:00000080,l_text:Archivo%20Black_60_line_spacing_-20:' +
      'FIVE%20DI%20ANTI-PATTERNS%20HAUNTING%20.NET%20APPS/' +
      'fl_layer_apply,g_south_west,x_60,y_180/' +
      'bo_15px_solid_%23e83a47,b_%23e83a47,co_%23000000,l_text:Archivo%20Black_32:' +
      'AND%20HOW%20TO%20FIX%20THEM,c_fit,w_600,h_50/' +
      'fl_layer_apply,g_south_west,x_60,y_100/v1/ograph/ograph_3.png'
  );
  assert.deepEqual(splitSocialTitle('A short title'), {
    main: 'A',
    ending: 'short title'
  });
  assert.match(detail, /image=\{socialImage\}/);
  assert.doesNotMatch(detail, /image=\{item\.thumbnail/);
});

test('content pages distribute backgrounds evenly in stable key order', () => {
  const content = Array.from({ length: 14 }, (_, index) => ({
    key: `content:${String(index).padStart(2, '0')}`,
    title: `Content title number ${index}`,
    topics: ['C#']
  })).reverse();
  const images = assignContentSocialImages(content);
  const counts = Array.from({ length: 6 }, () => 0);

  for (const image of images.values()) {
    const background = Number(image.match(/ograph_(\d)\.png$/)?.[1]);
    counts[background - 1] += 1;
  }

  assert.deepEqual(counts, [3, 3, 2, 2, 2, 2]);
  assert.match(images.get('content:00'), /ograph_1\.png$/);
  assert.match(images.get('content:05'), /ograph_6\.png$/);
});

test('content images double encode commas for Cloudinary text layers', () => {
  const image = buildContentSocialImage(
    {
      title: 'The Secret to Mastering Queue, Stack and Dictionary in C#!',
      topics: ['C#']
    },
    3
  );

  assert.match(image, /QUEUE%252C%20STACK/);
  assert.doesNotMatch(image, /QUEUE%2C%20STACK/);
  assert.match(image, /l_text:Archivo%20Black_32:AND%20DICTIONARY%20IN%20C%23%21/);
});

test('content title layers keep product names and versions together', () => {
  const cases = [
    [
      'Tame Configuration in ASP.NET Core with IValidateOptions',
      ['Tame Configuration in ASP.NET Core', 'with IValidateOptions']
    ],
    [
      'Avoid These EF Core Mistakes Today',
      ['Avoid These EF Core', 'Mistakes Today']
    ],
    [
      'Working with Entity Framework Migrations',
      ['Working with Entity Framework', 'Migrations']
    ],
    [
      'Remembering SQL Server 2000 Today',
      ['Remembering SQL Server 2000', 'Today']
    ],
    [
      'Unit of Work with Entity Framework Core',
      ['Unit of Work with', 'Entity Framework Core']
    ],
    [
      'Build Better Software Every Day with C# API tips now',
      ['Build Better Software Every Day', 'with C# API tips now']
    ]
  ];

  for (const [title, [main, ending]] of cases) {
    assert.deepEqual(splitSocialTitle(title), { main, ending });
  }
});

test('content subheads never exceed 21 characters including spaces', () => {
  for (const entry of Object.values(taxonomy.entries)) {
    const { ending } = splitSocialTitle(entry.title);
    assert.ok(
      ending.length <= 21,
      `"${entry.title}" generated a ${ending.length} character subhead: "${ending}"`
    );
  }

  const unsplittable = buildContentSocialImage(
    {
      title: 'Understanding Supercalifragilisticexpialidocious',
      topics: ['C#']
    },
    1
  );
  assert.doesNotMatch(unsplittable, /l_text:Archivo%20Black_32:/);
});
