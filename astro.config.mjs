// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import expressiveCode from 'astro-expressive-code';
import sitemap from '@astrojs/sitemap';
import preact from '@astrojs/preact';
import netlify from '@astrojs/netlify';
import { rehypeDemoteHeadings } from './src/lib/rehype-demote-headings.mjs';

/*
  Every route whose page asks not to be indexed.

  Two mechanisms, because there are two kinds of page and neither covers the other.

  serialize below is the real one. It runs after the build has written dist, so it can
  read the robots meta each page actually emitted and drop anything that says noindex.
  That is the only thing that catches dynamic routes, and dynamic routes were where the
  damage was: draft posts, filtered topic views and every dev disaster sort permutation
  were all correctly marked noindex in their own markup and all listed in the sitemap
  anyway. Five unpublished drafts were being submitted to Google.

  noindexRoutes covers what serialize cannot see. On demand pages write no file, so there
  is no markup to read, and they reach the sitemap purely as routes. That is how
  /unsubscribe/ stayed listed after being parked.

  This file used to assert that on demand pages are invisible to the sitemap and that
  report was therefore excluded. Both halves were false. Nothing surfaced it because a
  sitemap is generated and never read by a person.
*/
function noindexRoutes() {
  const root = fileURLToPath(new URL('./src/pages/', import.meta.url));
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir @param {string} prefix */
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Astro does not route a leading underscore, so nothing under one can be listed.
      if (entry.name.startsWith('_')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith('.astro') && !entry.name.includes('[')) {
        /*
          Only counts as noindex when it is an attribute on a component tag. A bare word
          match would exclude any page that merely writes the word in its prose, and this
          site has pages that explain their own indexing.
        */
        const src = fs.readFileSync(full, 'utf8');
        if (!/<[A-Z][\w.]*[^>]*\bnoindex\b/s.test(src)) continue;
        const base = entry.name.replace(/\.astro$/, '');
        out.push(base === 'index' ? prefix : `${prefix}${base}/`);
      }
    }
  };
  walk(root, '/');
  return out;
}

const NOINDEX = noindexRoutes();

/**
  True when the page this url built to emitted a noindex robots meta.

  Fails open on a missing file, which is the right direction here: a sitemap entry that
  should not be there is caught by scripts/check-dist.mjs immediately afterwards, whereas
  silently dropping real pages from the sitemap would be invisible. Config fails open, the
  gate fails closed.

  @param {string} pathname
*/
function builtNoindex(pathname) {
  const file = fileURLToPath(new URL(`./dist${pathname}index.html`, import.meta.url));
  if (!fs.existsSync(file)) return false;
  return /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(fs.readFileSync(file, 'utf8'));
}

// https://astro.build/config
export default defineConfig({
  site: 'https://baldbeardedbuilder.com',
  trailingSlash: 'always',
  output: 'static',
  adapter: netlify(),
  devToolbar: {
    enabled: false
  },
  /*
    See src/lib/rehype-demote-headings.mjs. A markdown body that opens with its own title
    would otherwise put a second h1 on a page that already has one.
  */
  markdown: {
    rehypePlugins: [rehypeDemoteHeadings]
  },
  integrations: [
    // Options live in ec.config.mjs. See the comment at the top of that file.
    expressiveCode(),
    preact({ compat: false }),
    sitemap({
      filter: (page) => {
        // Profiles are noindex by decision 14, so they stay out of the sitemap too.
        if (page.includes('/builders/')) return false;
        const route = new URL(page).pathname;
        return !NOINDEX.includes(route);
      },

      /*
        Runs at astro:build:done, so dist exists and every prerendered page can be asked
        directly whether it wants to be indexed. Returning undefined drops the entry.
      */
      serialize: (item) => (builtNoindex(new URL(item.url).pathname) ? undefined : item),

      /*
        Submit is rendered on demand, because it has to know whether the reader is signed
        in before it draws a form that needs a sign in. It is a page people should be able
        to find, so it is named here as well. Astro dedupes, so listing it twice is
        harmless, and naming it keeps it in the sitemap if it is ever prerendered behind a
        different route shape.
      */
      customPages: ['https://baldbeardedbuilder.com/submit/']
    })
  ]
});
