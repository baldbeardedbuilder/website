/*
  The rules that decide what a profile form is allowed to save.

  These were inside `saveAccount`, which opens with `if (!supabaseWritable) return ...`.
  There are no v2 keys, so that early return is the only branch any gate has ever taken and
  none of this had executed anywhere. `safeUrl` is the function that stops a `javascript:`
  URL becoming a link on a public profile, and it had never been run by anything.

  None of it needs a database. It needs a handle and some strings. So it lives here, in a
  module that imports nothing at all, where a test can call it. Same reasoning and same
  shape as `grid-fill.ts` and `ownership.ts`.

  Importing nothing is the requirement rather than a nicety: `node --test` strips types but
  still resolves imports, and `./supabase` is a directory, so anything importing `account.ts`
  fails to load before a single assertion runs.
*/

/** 3 to 32 characters, lower case, and a hyphen may not open or close it. */
export const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 32;
export const BIO_MAX = 280;
export const LINKS_MAX = 4;
export const LABEL_MAX = 40;
export const DISPLAY_NAME_MAX = 60;

/*
  The sentence a person reads when the handle is refused. It states the same three limits
  the regular expression enforces, and a test holds the two together, because a message
  describing a rule the code does not implement is the defect this branch keeps finding.
*/
export const HANDLE_ERROR =
  'A handle is 3 to 32 characters, lower case letters, numbers and hyphens, and cannot start or end with a hyphen.';

/*
  A type alias rather than an interface on purpose. The `links` column is `Json`, and an
  interface has no implicit index signature so it is not assignable to one, while a type
  alias is. Changing this to `interface` fails the build with a message that does not
  mention either word.
*/
export type ProfileLink = {
  label: string;
  url: string;
};

/** Form values arrive as `FormDataEntryValue | null`. Everything downstream wants a string. */
export function textField(raw: unknown, max: number): string {
  return String(raw ?? '')
    .trim()
    .slice(0, max);
}

/** Lower cased and trimmed before it is tested, so `  BBB ` and `bbb` are one handle. */
export function normalizeHandle(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

/** Null when the handle is allowed, or the sentence to show when it is not. */
export function handleProblem(handle: string): string | null {
  return HANDLE_RE.test(handle) ? null : HANDLE_ERROR;
}

/*
  Anything carrying a scheme that is not http or https is refused here, before the
  prefixing below can touch it.

  Without this line the safety was accidental. `https://` was pasted onto the front of
  whatever arrived, so `javascript:alert(1)` became `https://javascript:alert(1)`, which is
  refused only because `alert(1)` is not a valid port number. A scheme followed by a slash
  parses perfectly well: `file:///etc/passwd` came back as `https://file///etc/passwd`, a
  live link to a host called `file`. The url was harmless and the mechanism was not, because
  what refused the dangerous ones was the port parser rather than any rule about schemes.

  The lookahead keeps a bare host and port working. `example.com:8080` reads as a scheme by
  shape, so the digit test is what tells a port apart from `mailto:`.
*/
const OTHER_SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/**
 * Keeps only http and https. A javascript: or data: URL in a profile link is an attack.
 *
 * A bare `example.com` is treated as https rather than refused, because somebody typing
 * their own site into a form does not think of the scheme as part of it.
 */
export function safeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isHttp = /^https?:\/\//i.test(trimmed);
  if (!isHttp && OTHER_SCHEME_RE.test(trimmed)) return null;

  const withScheme = isHttp ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    /*
      The rule stated once more against the parsed url, so it holds whatever the prefixing
      above is changed to later.
    */
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** An unlabelled link draws its own hostname rather than a naked url or a blank. */
export function labelFor(url: string, label: string): string {
  if (label) return label;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * The links a profile form posted, in order, skipping the empty and the unsafe.
 *
 * `read` takes a field name and returns what was posted, which is `form.get` with the
 * `FormData` left at the call site. A row with no url is skipped whatever its label says,
 * because a label is not a link.
 */
export function linksFrom(read: (name: string) => unknown): ProfileLink[] {
  const links: ProfileLink[] = [];
  for (let i = 0; i < LINKS_MAX; i++) {
    const url = safeUrl(String(read(`link_url_${i}`) ?? ''));
    if (!url) continue;
    links.push({ label: labelFor(url, textField(read(`link_label_${i}`), LABEL_MAX)), url });
  }
  return links;
}
