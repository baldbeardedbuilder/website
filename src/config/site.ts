/*
  Site configuration.

  Everything here would otherwise have to live in content frontmatter, which sits in the
  michaeljolley/content submodule and is read only from this repo. Anything that needs to
  change without a submodule bump belongs in this file.
*/

export interface Topic {
  /** URL segment. Content lives at /[slug]/[entry]/ */
  slug: string;
  /** Nav and chip label. Lowercase on purpose, it is a path segment first. */
  label: string;
  /** Longer name for footer columns and page titles. */
  title: string;
  /** Deck copy on the topic page. */
  blurb: string;
  /**
   * Hidden topics keep their URL space reserved but stay out of the nav and the chip
   * rail. Blazor starts thin, and a topic page with three items on it reads as abandoned
   * rather than new.
   */
  visible: boolean;
}

export const TOPICS: Topic[] = [
  {
    slug: 'csharp',
    label: 'csharp',
    title: 'C#',
    blurb:
      'The language itself. Pattern matching, nullable reference types, records, and the ' +
      'features people skip because the old way still compiles.',
    visible: true
  },
  {
    slug: 'aspnetcore',
    label: 'aspnetcore',
    title: 'ASP.NET Core',
    blurb:
      'Minimal APIs, middleware, dependency injection, configuration, and the parts of ' +
      'the request pipeline that only bite you in production.',
    visible: true
  },
  {
    slug: 'data',
    label: 'data',
    title: 'Data and EF Core',
    blurb:
      'EF Core, SQL Server, migrations, and the long slow realization that the database ' +
      'was never the slow part.',
    visible: true
  },
  {
    slug: 'copilot-ai',
    label: 'copilot/ai',
    title: 'Copilot / AI',
    blurb:
      'Getting real work out of AI tooling, and being honest about the parts where it ' +
      'still hands you confident nonsense.',
    visible: true
  },
  {
    slug: 'windows',
    label: 'windows',
    title: 'Windows',
    blurb:
      'Building for the desktop people actually use. WinUI, packaging, PowerShell, and ' +
      'the platform quirks nobody documents.',
    visible: true
  },
  {
    slug: 'vscode',
    label: 'vscode',
    title: 'VS Code',
    blurb:
      'Extensions, workflows, remote development, and the editor tricks that turn a ' +
      'fresh install into a place worth spending the day.',
    visible: true
  },
  {
    slug: 'blazor',
    label: 'blazor',
    title: 'Blazor',
    blurb:
      'Server, WebAssembly, components, rendering modes, and the browser boundary that ' +
      'changes shape every release.',
    visible: false
  },
  {
    slug: 'git',
    label: 'git',
    title: 'Git',
    blurb:
      'Branches, commits, rebases, recovery, and the commands that make version control ' +
      'feel less like defusing a bomb.',
    visible: false
  },
  {
    slug: 'github',
    label: 'github',
    title: 'GitHub',
    blurb:
      'Pull requests, issues, Gists, repository workflows, and the collaboration layer ' +
      'around the code.',
    visible: false
  },
  {
    slug: 'cloud',
    label: 'cloud',
    title: 'Cloud',
    blurb:
      'Azure, containers, deployment, and the bill that shows up when something you ' +
      'wired at 2am keeps running.',
    visible: false
  },
  {
    slug: 'dev-life',
    label: 'dev-life',
    title: 'Dev life',
    blurb:
      'Everything that is not code. Reviews, postmortems, burnout, teaching, and ' +
      'learning out loud where people can watch you get it wrong.',
    visible: true
  }
];

export const TOPIC_SLUGS = TOPICS.map((t) => t.slug);
export const VISIBLE_TOPICS = TOPICS.filter((t) => t.visible);
export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug);

/**
 * Top level paths that are not topics. Content is served from /[topic]/[slug]/, so a
 * topic slug that collides with one of these would shadow a real page. Enforced by a
 * test rather than by remembering.
 */
export const RESERVED_SLUGS = [
  '404',
  'about',
  'all',
  'articles',
  'blog',
  'builders',
  'conduct',
  'dev-disasters',
  'images',
  'kitchen-sink',
  'privacy',
  'report',
  'rss.xml',
  'search',
  'settings',
  'sitemap-index.xml',
  'submit',
  'terms',
  'topics',
  'uses',
  'videos'
] as const;

/**
 * The four diagnostic severities, which are the ones the editor already draws. They
 * replace the rejected SEV-1 through SEV-4 scale, because a developer reading "Warning"
 * already knows roughly how bad it was.
 */
export const SEVERITIES = [
  { id: 'error', label: 'Error', blurb: 'Took production down.' },
  { id: 'warning', label: 'Warning', blurb: 'Nearly took production down.' },
  { id: 'info', label: 'Info', blurb: 'Expensive lesson everybody lived through.' },
  { id: 'hint', label: 'Hint', blurb: 'Just embarrassing.' }
] as const;

export type SeverityId = (typeof SEVERITIES)[number]['id'];

/**
 * The severity id and the severity CSS class are not the same word. The design system
 * writes `sev-warn` and `wq-warn`, the id is `warning`, and every template that forgets
 * that renders an unstyled chip that still looks almost right. One map, used everywhere.
 */
const SEV_CLASS: Record<SeverityId, string> = {
  error: 'error',
  warning: 'warn',
  info: 'info',
  hint: 'hint'
};

/** `sev-error`, `sev-warn`, `sev-info`, `sev-hint`. */
export const sevClass = (id: SeverityId) => `sev-${SEV_CLASS[id]}`;

/** `wq-error`, `wq-warn`, `wq-info`, `wq-hint`, the wall card modifier. */
export const wqClass = (id: SeverityId) => `wq-${SEV_CLASS[id]}`;

export const sevLabel = (id: SeverityId) => SEVERITIES.find((s) => s.id === id)?.label ?? id;


/** One sort for the whole dev disasters list. Severity filters it, never groups it. */
export const DISASTER_SORTS = [
  { id: 'liked', label: 'Most liked' },
  { id: 'replies', label: 'Most replies' },
  { id: 'newest', label: 'Newest' }
] as const;

/**
 * Words a dev disaster slug can never be, because the archive serves its severity and
 * sort views from those same segments.
 *
 * The submission route is retired, but these words still belong to archive routes and
 * remain reserved for stored story slugs.
 */
export const RESERVED_DISASTER_SLUGS = [
  'all',
  ...SEVERITIES.map((s) => s.id),
  ...DISASTER_SORTS.map((s) => s.id)
] as string[];

export const SITE = {
  name: 'Bald Bearded Builder',
  author: 'Michael Jolley',
  tagline:
    'Bringing smiles to the syntax, because laughter is the best error handler.',
  url: 'https://baldbeardedbuilder.com',
  /** Shown on the code of conduct. Bump it whenever the rules actually change. */
  conductUpdated: '2026-08-31',
  /** Shown on the privacy page. */
  privacyUpdated: '2026-08-03',
  /** Shown on the terms page. */
  termsUpdated: '2026-08-31',
  /*
    Two role addresses, deliberately not one.

    Decision 129. A single contactEmail had to point somewhere, and pointing it at the
    conduct inbox would have routed data and deletion requests into the one inbox that
    has to stay readable during an incident. There is no alias back to a general address
    on purpose: the next page that needs somewhere to write would take it and land in
    whichever inbox it happened to name.

    Role addresses rather than a personal one because the conduct page's own copy says
    reporting Michael to Michael is awkward, and a personal inbox cannot serve that
    sentence. These can be handed to a moderator without a code change.
  */
  conductEmail: 'coc@baldbeardedbuilder.com',
  privacyEmail: 'privacy@baldbeardedbuilder.com'
} as const;

export const EXTERNAL = {
  drip: 'https://dotnetdrip.com',
  youtube: 'https://youtube.com/@baldbeardedbuilder',
  twitch: 'https://twitch.tv/baldbeardedbuilder',
  github: 'https://github.com/michaeljolley',
  repository: 'https://github.com/baldbeardedbuilder/website',
  bluesky: 'https://bsky.app/profile/baldbeardedbuilder.com',
	x: 'https://x.com/michaeljolley',
	linkedin: 'https://linkedin.com/in/michaelwjolley',
	discord: 'https://discord.gg/4TKgK4TGQA'
} as const;

/**
 * The Start here rail. Hand curated evergreen picks, deliberately not the latest work,
 * because the Fresh rail directly below it already shows that and the two would
 * duplicate each other.
 *
 * Entries are `collection:id` so a video and an article can sit side by side. Order is
 * the display order. Reorder here, not in the submodule.
 *
 * The first entry gets the wide card, whose thumbnail slot is drawn around a running
 * time, so it should stay a video. Five entries fill the grid.
 *
 * WHY A VIDEO NEEDS A BLURB HERE. The wide card in the mockup carries a title, a summary
 * and a foot line, and it was drawn that way because a summary is what gives the card its
 * height. Articles bring their own description. A video cannot: the videos collection
 * schema is id, date, title, link, thumbnail, views, likes, comments, short and duration,
 * with no description field anywhere in it, and the collection lives in a submodule this
 * repo treats as read only. So a video lead with no blurb draws a title and a foot line
 * with a hole between them, sized by whichever neighbour had more to say.
 *
 * The blurb is the fix, and it belongs here rather than in the submodule for the same
 * reason the picks do. It is editorial, it is about why this is where somebody should
 * start, and it is a better sentence than a generic description would have been.
 *
 * TODO: Michael to confirm the final five and to reword the blurb in his own voice.
 * These are real entries picked from the catalogue so the rail renders against real
 * content until he chooses.
 */
export interface Starter {
  /** `collection:id`, the same key taxonomy.json uses. */
  key: string;
  /**
   * Optional editorial line, used in place of the item's own description.
   *
   * Required in practice for the first entry, because it takes the wide card and a video
   * has no description to fall back on. Optional for the rest, which are articles.
   */
  blurb?: string;
}

export const START_HERE: Starter[] = [
  { 
		key: 'videos:DNzAoLwXLzc',
		blurb:
			'Lowercasing strings to compare them costs allocations and can break under ' +
			'different cultures (hello, Turkish I). Why .ToLower()/.ToUpper() are the ' +
			'wrong tools for comparisons and how StringComparison and StringComparer ' +
			'give you fast, correct behavior'
	},
  { key: 'blog:tame-configuration-in-aspnet-core-with-ivalidateoptions' },
  { key: 'blog:repository-pattern-vs-dbcontext-in-entity-framework-core' },
  {
    key: 'videos:HAybBV-A1Gg',
    blurb:
      'Class, struct or record. You choose one of these every time you model anything ' +
      'in C#, and most advice stops at "records are for data". Under eight minutes on ' +
      'what actually drives the decision.'
  },
  { key: 'blog:the-traps-of-nullable-in-c-sharp' }
];
