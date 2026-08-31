/*
  The three notification emails, and the retry schedule.

  Everything that touches Supabase or a mail provider is left to the soak, because a
  mocked provider that agrees with itself proves nothing. What is worth pinning down is
  the copy and the arithmetic.

  The copy, because an email is the one thing on this site that cannot be edited after it
  ships. Two failures matter more than the rest: an unsubscribe link that drops the type
  and silently turns everything off, and an excerpt somebody typed arriving unescaped in
  the HTML version.

  The arithmetic, because being wrong about the backoff is invisible until a provider has
  a bad hour and somebody gets the same message forty times.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backoffMinutes,
  isDue,
  renderNotification,
  unsubscribeUrl,
  MAX_ATTEMPTS
} from '../src/lib/notify-templates.ts';

const TOKEN = '11111111-2222-3333-4444-555555555555';

test('backoff widens and then stops widening', () => {
  assert.equal(backoffMinutes(1), 5);
  assert.equal(backoffMinutes(2), 10);
  assert.equal(backoffMinutes(3), 20);
  assert.equal(backoffMinutes(4), 40);
  assert.equal(backoffMinutes(5), 60);
  assert.equal(backoffMinutes(50), 60, 'capped, so a stuck row never waits days');
});

test('a fresh row is due and an exhausted one never is', () => {
  assert.equal(isDue(0, null), true);
  assert.equal(isDue(MAX_ATTEMPTS, null), false);
  assert.equal(isDue(MAX_ATTEMPTS + 1, null), false);
});

test('a failed row waits its backoff before being tried again', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  const fourMinutesAgo = new Date(now.getTime() - 4 * 60_000).toISOString();
  const sixMinutesAgo = new Date(now.getTime() - 6 * 60_000).toISOString();

  assert.equal(isDue(1, fourMinutesAgo, now), false);
  assert.equal(isDue(1, sixMinutesAgo, now), true);
});

test('an unsubscribe link carries the type it is unsubscribing from', () => {
  const url = new URL(unsubscribeUrl(TOKEN, 'comment_reply'));
  assert.equal(url.pathname, '/unsubscribe/');
  assert.equal(url.searchParams.get('token'), TOKEN);
  assert.equal(
    url.searchParams.get('kind'),
    'comment_reply',
    'without the kind, turning off reply emails turns off all of them'
  );
});

test('a published story email links to the story and offers the right opt out', () => {
  const mail = renderNotification(
    'story_published',
    { slug: 'the-raccoon-in-the-server-room-was-not-a-metaphor', line: 'It was a raccoon.' },
    TOKEN
  );

  assert.ok(mail);
  assert.match(mail.text, /dev-disasters\/the-raccoon-in-the-server-room-was-not-a-metaphor\//);
  assert.match(mail.text, /It was a raccoon\./);
  assert.match(mail.unsubscribeUrl, /kind=story_published/);
  assert.match(mail.text, /anonymous/i, 'anonymous tellers still get told, and are told why');
});

test('a featured story email is not the published one wearing a different subject', () => {
  const published = renderNotification('story_published', { slug: 'x', line: 'y' }, TOKEN);
  const featured = renderNotification('story_featured', { slug: 'x', line: 'y' }, TOKEN);

  assert.ok(published && featured);
  assert.notEqual(published.subject, featured.subject);
  assert.match(featured.text, /front page/);
  assert.match(featured.unsubscribeUrl, /kind=story_featured/);
});

test('a story published and featured together produces one message that says both', () => {
  const mail = renderNotification(
    'story_featured',
    { slug: 'x', line: 'y', published_together: true },
    TOKEN
  );

  assert.ok(mail);
  assert.match(mail.text, /published/i);
  assert.match(mail.text, /front page/i);
});

test('a story with no slug renders nothing rather than a broken link', () => {
  assert.equal(renderNotification('story_published', { line: 'no slug here' }, TOKEN), null);
});

test('retired reply notifications render nothing even when an old row resolves', () => {
  assert.equal(renderNotification('comment_reply', { excerpt: 'hello' }, TOKEN), null);
});

test('every email says how to stop getting it', () => {
  const cases = [
    renderNotification('story_published', { slug: 'a', line: 'b' }, TOKEN),
    renderNotification('story_featured', { slug: 'a', line: 'b' }, TOKEN)
  ];

  for (const mail of cases) {
    assert.ok(mail);
    assert.match(mail.text, /Turn this one off:/);
    assert.match(mail.text, /Account data and email help:/);
    assert.doesNotMatch(mail.text, /\/account\//);
    assert.ok(mail.text.includes(mail.unsubscribeUrl));
  }
});

test('the text and the HTML say the same things', () => {
  const mail = renderNotification('story_featured', { slug: 'a', line: 'A line.' }, TOKEN);
  assert.ok(mail);

  /*
    Not a literal comparison. The text version writes a link as "label: url" and the HTML
    version writes an anchor, so links are checked as URLs and prose is checked as prose.
  */
  for (const line of mail.text.split('\n').filter(Boolean)) {
    const url = line.match(/https?:\/\/\S+/)?.[0];
    if (url) {
      const escapedUrl = url.replace(/&/g, '&amp;');
      assert.ok(
        mail.html.includes(url) || mail.html.includes(escapedUrl),
        `the HTML version is missing the link: ${url}`
      );
      continue;
    }
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    assert.ok(mail.html.includes(escaped), `the HTML version is missing: ${line}`);
  }
});

test('HTML email is image free and carries the site visual signature', () => {
  const mail = renderNotification('story_published', { slug: 'a', line: 'b' }, TOKEN);
  assert.ok(mail);
  assert.doesNotMatch(mail.html, /<img/i);
  assert.match(mail.html, /bbb \/ notification/i);
  assert.match(mail.html, /#915f0f/i);
});
