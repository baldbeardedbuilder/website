/*
  The bridge between the content submodule and the topic first URLs.

  Content lives in michaeljolley/content and is read only from here. taxonomy.json says
  which topic owns each item and what its slug is. Nothing else in the site should read
  taxonomy.json directly, so that the day the nightly bot starts writing topics into
  frontmatter there is exactly one place to change.
*/

import { getCollection, type CollectionEntry } from 'astro:content';
import taxonomy from '../config/taxonomy.json';
import { topicBySlug, type Topic } from '../config/site';
import { isPublished } from './publish';
import { videoPages } from './video-pages';
import { bakedLikes } from './likes';

export type ItemKind = 'article' | 'video' | 'short';

export function isVideoKind(kind: ItemKind): boolean {
  return kind === 'video' || kind === 'short';
}

export function itemKindLabel(kind: ItemKind): string {
  return {
    article: 'Article',
    video: 'Video',
    short: 'Short'
  }[kind];
}

export interface Item {
  /** collection:id, the key used by taxonomy.json and START_HERE. */
  key: string;
  kind: ItemKind;
  slug: string;
  /**
   * The page on this site, or null when there is not one.
   *
   * Null only ever happens for a video, and only when no video_pages row exists for it.
   * Deliberately nullable rather than defaulting to the URL a page would have had, so
   * that anything printing a link to a page has to say out loud what it does when there
   * is no page. Use href to link to an item and url to talk about a page.
   */
  url: string | null;
  /** Where a card sends somebody. The page when there is one, YouTube when there is not. */
  href: string;
  /** True when href points off this site. */
  offsite: boolean;
  topic: string;
  alsoFiled: string[];
  title: string;
  description: string;
  date: Date;
  /** Reading time for an article, running time for a video. Already formatted. */
  length: string;
  /** YouTube views for a video, null for an article. */
  views: number | null;
  /**
   * Likes from the platform where the item is published: this site for articles and
   * YouTube for videos. Null only when YouTube did not return a count.
   */
   engagementLikes: number | null;
   thumbnail: string | null;
  /** YouTube watch URL. Only set on videos. */
  external: string | null;
  /**
   * Dated in the future. The nightly bot stages posts ahead of time. They build, so the
   * URL is live and shareable the moment the date passes and nothing 404s in between,
   * but they stay out of every listing until then.
   */
  draft: boolean;
}

interface TaxonomyEntry {
  primaryTopic: string;
  alsoFiled: string[];
  slug: string;
  url: string;
  title: string;
}

const entries = taxonomy.entries as unknown as Record<string, TaxonomyEntry>;

/**
 * Roughly 220 words a minute, which is the number most reading time estimates settle on.
 * Deliberately not exact. A reader wants to know if this is a coffee or a commute.
 */
function readingTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  return `${Math.max(1, Math.round(words / 220))} min`;
}

/** 00:52 stays 00:52. 01:05:30 becomes 1:05:30. */
function runtime(duration: string): string {
  return duration.replace(/^0(?=\d:)/, '').replace(/^00:(?=\d)/, '0:');
}

let cache: Item[] | null = null;

async function loadItems(): Promise<Item[]> {
  if (cache) return cache;

  const [blog, videos, pages, likes] = await Promise.all([
    getCollection('blog'),
    getCollection('videos'),
    videoPages(),
    bakedLikes('content')
  ]);
  const now = new Date();
  const items: Item[] = [];

  for (const post of blog as CollectionEntry<'blog'>[]) {
    const key = `blog:${post.id}`;
    const t = entries[key];
    if (!t) continue;
    items.push({
      key,
      kind: 'article',
      slug: t.slug,
      url: t.url,
      href: t.url,
      offsite: false,
      topic: t.primaryTopic,
      alsoFiled: t.alsoFiled ?? [],
      title: post.data.title,
      description: post.data.summary || post.data.description,
      date: post.data.pubDate,
      length: readingTime(post.body ?? ''),
      views: null,
      engagementLikes: likes.get(key) ?? 0,
      thumbnail: post.data.image ?? null,
      external: null,
      draft: !isPublished(post.data.pubDate, now)
    });
  }

  for (const video of videos as CollectionEntry<'videos'>[]) {
    const page = pages.get(video.data.id);
    if (page?.included === false) continue;

    const key = `videos:${video.data.id}`;
    const t = entries[key];
    if (!t) continue;
    /*
      No row, no page. The card then points at YouTube, which is where the video has been
      the whole time, rather than at a page that would only exist to say so.
    */
    const live = page ? isPublished(page.publishedAt, now) : false;
    items.push({
      key,
      kind: video.data.short ? 'short' : 'video',
      slug: t.slug,
      url: live ? t.url : null,
      href: live ? t.url : video.data.link,
      offsite: !live,
      topic: t.primaryTopic,
      alsoFiled: t.alsoFiled ?? [],
      title: video.data.title,
      /*
        Videos carry no description in the collection, and nothing generates one. A row in
        video_pages is the only source, so until Michael writes one a video row in a feed
        is a title, a kind and a runtime. That is the shape to design for, not the
        exception to handle.
      */
      description: page?.summary ?? '',
      date: video.data.date,
      length: runtime(video.data.duration),
      views: video.data.views ?? null,
      engagementLikes: video.data.likes ?? null,
      thumbnail: video.data.thumbnail,
      external: video.data.link,
      draft: !isPublished(video.data.date, now)
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  cache = items;
  return items;
}

/*
  Decision 110. THE DEFAULT IS PUBLISHED, AND WANTING DRAFTS IS SOMETHING YOU SAY OUT LOUD.

  This used to return everything, so every listing on the site had to remember to filter
  drafts on its way out. Four remembered, one wanted them on purpose, and one forgot, which
  put an unpublished post in the curated rail on the front page. A default that is unsafe
  with an exclusion that is opt-in only ever fails in one direction, and it fails quietly,
  because a missing filter looks exactly like a filter nobody needed.

  So the safe thing is the short name and the dangerous thing has to be asked for by a name
  that says what it does. Anything written later is right without knowing the rule exists.
*/
export async function allItems(): Promise<Item[]> {
  return (await loadItems()).filter((i) => !i.draft);
}

/**
 * The catalogue including posts whose date has not arrived.
 *
 * Only for surfaces that build pages rather than list them. A draft has a real page, built
 * and noindexed, so that it can be previewed before its date. Nothing that renders a
 * listing should be calling this.
 */
export async function allItemsIncludingDrafts(): Promise<Item[]> {
  return loadItems();
}

export async function itemsInTopic(slug: string): Promise<Item[]> {
  return (await allItems()).filter((i) => i.topic === slug);
}

/** Everything with a page on this site. What getStaticPaths and the sitemap want. */
export async function pagedItems(): Promise<Item[]> {
  return (await allItemsIncludingDrafts()).filter((i) => i.url !== null);
}

/**
 * One item by key, or undefined, drafts included.
 *
 * This is a lookup and not a listing. It exists because a comment can be left on a draft's
 * page, so the notification pointing back at that comment has to resolve an item its own
 * listings would not show. Callers get undefined rather than a throw because an event that
 * no longer resolves is a row to settle, not a build to fail.
 */
export async function itemByKey(key: string): Promise<Item | undefined> {
  return (await allItemsIncludingDrafts()).find((i) => i.key === key);
}

/*
  Decision 111. A CURATED PICK THAT IS NOT PUBLISHED IS AN ERROR, NOT A GAP.

  Reads the unfiltered catalogue on purpose, so that a pick which exists but has not
  published yet reports as unpublished rather than as a key nobody can find. Those are
  different mistakes and they have different fixes, so they get different messages.
*/
export async function itemsByKeys(keys: readonly string[]): Promise<Item[]> {
  const all = await allItemsIncludingDrafts();
  return keys.map((k) => {
    const found = all.find((i) => i.key === k);
    /*
      Curated lists are hand written, so a typo would otherwise show up as a grid that is
      quietly one card short rather than as an error anybody notices.
    */
    if (!found) throw new Error(`No content item with key "${k}". Check src/config/site.ts.`);

    /*
      A pick that has not published is the same failure wearing a different hat. Dropping it
      leaves the rail one card short with only a warning nobody reads to say why, and it
      changes the card count, which the grid pays for separately.

      The earlier version of this argued that failing here breaks a build on a morning when
      nobody edited anything. That was wrong, and it is worth saying why rather than just
      deleting it: drafts only ever turn into published posts, so time clears this error and
      never causes it. The only way to see it is to add a pick that has not published, which
      is an edit, made by the person who can undo it.
    */
    if (found.draft) {
      const when = found.date.toISOString().slice(0, 10);
      throw new Error(
        `Curated pick "${k}" is dated ${when} and has not published, so it cannot be in a ` +
          'curated list yet. Remove it from src/config/site.ts and add it back on or after ' +
          `${when}. Its page exists and is noindexed, so it can be previewed before then.`
      );
    }

    return found;
  });
}

export interface TopicView {
  topic: Topic;
  items: Item[];
  articles: number;
  videos: number;
}

export async function topicView(slug: string): Promise<TopicView | null> {
  const topic = topicBySlug(slug);
  if (!topic) return null;
  const items = await itemsInTopic(slug);
  return {
    topic,
    items,
    articles: items.filter((i) => i.kind === 'article').length,
    videos: items.filter((i) => isVideoKind(i.kind)).length
  };
}

/**
 * Sub paths a topic serves that are filters rather than content. A content slug can
 * never be one of these, which tests/taxonomy.test.mjs enforces.
 */
export const TOPIC_FILTERS = ['articles', 'videos'] as const;
export type TopicFilter = (typeof TOPIC_FILTERS)[number];
