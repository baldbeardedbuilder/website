/*
  What the remaining story notification emails say.

  Separate from the drain on purpose. Everything here is pure: a kind, a payload and a
  URL in, a subject and two bodies out. That means the copy can be tested without a
  database, which matters more for email than for anything else on the site, because the
  first time you see the real thing is after it has arrived in somebody's inbox.

  Decision 15's three types, and nothing else. Adding a fourth means adding it here, in
  the queue's check constraint, and in the preferences table, and the compiler will only
  catch one of those.
*/

/*
  The .ts extension is load bearing. This module is imported by a plain node test, and
  node will not guess an extension the way the bundler does.
*/
import { SITE } from '../config/site.ts';

export type NotificationKind = 'story_published' | 'story_featured' | 'comment_reply';

/** How many times a queued row is tried before it is left alone for somebody to look at. */
export const MAX_ATTEMPTS = 5;

/**
 * Minutes to wait after each failure. Widening, and capped, so a provider outage costs
 * one attempt an hour rather than one a minute.
 */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 5 * 2 ** Math.max(0, attempts - 1));
}

export function isDue(attempts: number, lastAttemptAt: string | null, now = new Date()): boolean {
  if (attempts >= MAX_ATTEMPTS) return false;
  if (attempts === 0 || !lastAttemptAt) return true;
  const waited = (now.getTime() - new Date(lastAttemptAt).getTime()) / 60_000;
  return waited >= backoffMinutes(attempts);
}

export function absolute(path: string): string {
  return new URL(path, SITE.url).toString();
}

/**
 * The unsubscribe URL for one type.
 *
 * Carries the kind as well as the token, so somebody tired of reply notifications does
 * not also lose the email telling them their story went up. `all` exists for the footer
 * link, which is what people reach for when they mean all of it.
 */
export function unsubscribeUrl(token: string, kind: NotificationKind | 'all'): string {
  return absolute(`/unsubscribe/?token=${encodeURIComponent(token)}&kind=${kind}`);
}

/*
  A small escaper rather than a dependency. Everything in these templates is either
  written by us or is a title and an excerpt somebody else typed, and the second group is
  exactly why this exists.
*/
function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linked(raw: string): string {
  return raw
    .split(/(https?:\/\/\S+)/)
    .map((part) =>
      /^https?:\/\//.test(part)
        ? `<a href="${esc(part)}" style="color:#915f0f;text-decoration:underline">${esc(part)}</a>`
        : esc(part)
    )
    .join('');
}

export interface Rendered {
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
}

/*
  Plain text first, and the HTML built from it.

  Not a style choice. Each of these is four sentences and a link, and an HTML version
  that says something the text version does not is a version nobody reading in a terminal
  ever sees. Building one from the other makes drift impossible rather than unlikely.
*/
function render(
  subject: string,
  lines: string[],
  cta: { label: string; url: string },
  footer: string[],
  unsub: string
): Rendered {
  const body = lines.filter(Boolean);
  const text = [...body, '', `${cta.label}: ${cta.url}`, '', ...footer].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<title>${esc(subject)}</title>`,
    '</head>',
    '<body style="margin:0;background:#fbfaf8;color:#1b1a18;font-family:Atkinson Hyperlegible,Segoe UI,Arial,sans-serif;line-height:1.6">',
    `<div role="article" aria-roledescription="email" aria-label="${esc(subject)}">`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#fbfaf8">',
    '<tr><td align="center" style="padding:32px 16px">',
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #ddd9d2;border-top:6px solid #915f0f">',
    '<tr><td style="padding:32px 32px 12px">',
    '<p style="margin:0 0 16px;color:#5f5c57;font-family:Consolas,Monaco,monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase">bbb / notification</p>',
    `<h1 style="margin:0;color:#111111;font-family:Georgia,Times New Roman,serif;font-size:30px;line-height:1.2;font-weight:700">${esc(subject)}</h1>`,
    '</td></tr>',
    '<tr><td style="padding:8px 32px 32px">',
    ...body.map((line) => `<p style="margin:16px 0;font-size:17px">${esc(line)}</p>`),
    `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0"><tr><td style="background:#915f0f;border-radius:3px"><a href="${esc(cta.url)}" style="display:inline-block;padding:12px 18px;color:#ffffff;font-weight:700;text-decoration:none">${esc(cta.label)}</a></td></tr></table>`,
    '</td></tr>',
    '<tr><td style="padding:24px 32px;background:#f3f1ed;border-top:1px solid #ddd9d2">',
    ...footer.map((line) => `<p style="margin:7px 0;color:#5f5c57;font-size:13px;line-height:1.5">${linked(line)}</p>`),
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</div>',
    '</body>',
    '</html>'
  ].join('\n');

  return { subject, text, html, unsubscribeUrl: unsub };
}

/**
 * Build one email, or return null when the event no longer describes anything.
 *
 * Null is a real answer rather than a failure. A story unpublished before the queue
 * drained, or a reply on a page that has since gone, should stop quietly rather than
 * retry five times against a URL that will never resolve.
 */
export function renderNotification(
  kind: NotificationKind,
  payload: Record<string, unknown>,
  token: string
): Rendered | null {
  // Old reply rows can still exist in the queue, but there is no thread to send anyone to.
  if (kind === 'comment_reply') return null;

  const unsub = unsubscribeUrl(token, kind);
  const manage = absolute('/privacy/#retired-accounts');

  const footer = (why: string) => [
    `You are getting this because ${why}`,
    `Turn this one off: ${unsub}`,
    `Account data and email help: ${manage}`
  ];

  if (kind === 'story_published' || kind === 'story_featured') {
    const slug = typeof payload.slug === 'string' ? payload.slug : '';
    if (!slug) return null;

    const url = absolute(`/dev-disasters/${slug}/`);
    const line = typeof payload.line === 'string' ? payload.line : 'your dev disaster';

    if (kind === 'story_published') {
      return render(
        'Your dev disaster is up',
        [
          'Your story is on the site.',
          line,
          'If you asked to stay anonymous it is published with no name on it. It is still your story, and this is still your email.'
        ],
        { label: 'Read it', url },
        footer('you told a dev disaster and asked to hear when it published.'),
        unsub
      );
    }

    const publishedTogether = payload.published_together === true;

    return render(
      'Your dev disaster is on the front page',
      [
        publishedTogether
          ? 'Your story is published, and Michael put it on the front page.'
          : 'Michael put your story on the front page.',
        line,
        'Thanks for letting me share it.'
      ],
      { label: 'See it', url },
      footer('you told a dev disaster and asked to hear if it got featured.'),
      unsub
    );
  }

  return null;
}
