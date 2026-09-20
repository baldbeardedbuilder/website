/*
  Comment markdown.

  Rendered once, when a comment is written, and stored as HTML. Never rendered at read
  time, and the stored HTML is never trusted from a client.

  This is an allow list built from marked's token stream rather than a sanitiser run over
  generated HTML. The difference matters. A sanitiser is a filter you have to keep ahead
  of; a renderer that only knows how to emit eight tags cannot emit a ninth no matter what
  it is fed. Anything marked hands over that is not on the list becomes escaped text, so
  the worst case for a comment full of markup is that the reader sees the markup.

  Fenced code uses the same syntax scopes and palette variables as article code blocks.
*/

import { marked, type Token, type Tokens } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';
import codeTheme from './code-theme.mjs';

/*
  Languages a comment can ask for. Every grammar loaded is weight in the function that
  renders a comment, so this is the stack this site actually talks about plus the handful
  everybody pastes. An unknown language renders as plain text rather than failing.
*/
export const CODE_LANGS = [
  'csharp',
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'json',
  'html',
  'css',
  'sql',
  'bash',
  'powershell',
  'python',
  'yaml',
  'xml',
  'diff',
  'razor'
] as const;

const LANG_ALIASES: Record<string, string> = {
  cs: 'csharp',
  'c#': 'csharp',
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  ps1: 'powershell',
  pwsh: 'powershell',
  py: 'python',
  yml: 'yaml',
  postgres: 'sql',
  psql: 'sql'
};

let highlighter: Highlighter | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    // Shiki mutates its theme, so keep the source shared with Expressive Code untouched.
    highlighter = await createHighlighter({
      themes: [structuredClone(codeTheme)],
      langs: [...CODE_LANGS]
    });
  }
  return highlighter;
}

const THEME_NAME = codeTheme.name;

/** Text going into an HTML body. Ampersand first, or the others get double escaped. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/*
  Only http and https survive.

  javascript: is the obvious one. mailto: and tel: are harmless but put a reader's address
  book one mis-tap away, and data: is a way to serve a page from inside a link. A link
  that is not one of the two schemes people mean becomes plain text, so nothing is lost
  except the anchor.
*/
function safeHref(href: string): string | null {
  try {
    const url = new URL(href, 'https://baldbeardedbuilder.com');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

async function renderCode(code: string, lang: string | undefined): Promise<string> {
  const requested = (lang ?? '').trim().toLowerCase();
  const resolved = LANG_ALIASES[requested] ?? requested;
  const known = (CODE_LANGS as readonly string[]).includes(resolved);

  if (!known) {
    return `<pre class="c-code"><code>${esc(code)}</code></pre>`;
  }

  const hl = await getHighlighter();
  const html = hl.codeToHtml(code, {
    lang: resolved,
    theme: THEME_NAME,
    /*
      The theme carries a hex editor background so Expressive Code can parse it at build
      time. Left alone it would paste that one theme's surface into a comment under all
      sixteen, so the wrapper takes its background from the page instead.
    */
    structure: 'inline'
  });

  return `<pre class="c-code" data-lang="${esc(resolved)}"><code>${html}</code></pre>`;
}

async function renderInline(tokens: Token[] | undefined): Promise<string> {
  if (!tokens) return '';
  const parts: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'escape':
        parts.push(esc((token as Tokens.Text).text));
        break;
      case 'strong':
        parts.push(`<strong>${await renderInline((token as Tokens.Strong).tokens)}</strong>`);
        break;
      case 'em':
        parts.push(`<em>${await renderInline((token as Tokens.Em).tokens)}</em>`);
        break;
      case 'del':
        parts.push(`<del>${await renderInline((token as Tokens.Del).tokens)}</del>`);
        break;
      case 'codespan':
        parts.push(`<code>${esc((token as Tokens.Codespan).text)}</code>`);
        break;
      case 'br':
        parts.push('<br />');
        break;
      case 'link': {
        const link = token as Tokens.Link;
        const href = safeHref(link.href);
        const label = await renderInline(link.tokens);
        /*
          ugc and nofollow because a comment box is an open invitation to anybody who
          wants the site's ranking, and noopener because a link nobody vetted should not
          get a handle on the page that opened it.
        */
        parts.push(
          href
            ? `<a href="${esc(href)}" rel="nofollow ugc noopener">${label}</a>`
            : label
        );
        break;
      }
      /*
        Images are deliberately absent. An image in a comment is a request to an address
        the commenter chose, made by every reader of the thread, which is both a tracking
        pixel and a way to put something on the page that no moderator read.
      */
      default:
        parts.push(esc((token as { raw?: string }).raw ?? ''));
    }
  }

  return parts.join('');
}

async function renderBlocks(tokens: Token[], depth = 0): Promise<string> {
  /* Threading is one level and so is nesting. Anything deeper is flattened to text. */
  if (depth > 4) return '';

  const parts: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
        break;
      case 'paragraph':
        parts.push(`<p>${await renderInline((token as Tokens.Paragraph).tokens)}</p>`);
        break;
      case 'text': {
        const t = token as Tokens.Text;
        parts.push(t.tokens ? await renderInline(t.tokens) : esc(t.text));
        break;
      }
      case 'code':
        parts.push(await renderCode((token as Tokens.Code).text, (token as Tokens.Code).lang));
        break;
      case 'blockquote':
        parts.push(
          `<blockquote>${await renderBlocks((token as Tokens.Blockquote).tokens, depth + 1)}</blockquote>`
        );
        break;
      case 'list': {
        const list = token as Tokens.List;
        const tag = list.ordered ? 'ol' : 'ul';
        const items: string[] = [];
        for (const item of list.items) {
          items.push(`<li>${await renderBlocks(item.tokens, depth + 1)}</li>`);
        }
        parts.push(`<${tag}>${items.join('')}</${tag}>`);
        break;
      }
      case 'hr':
        parts.push('<hr />');
        break;
      /*
        Headings become bold paragraphs rather than heading elements. A comment cannot be
        allowed to inject an h1 into a page that already has one, and a thread full of
        real headings would show up in the page outline above the article it is about.
      */
      case 'heading':
        parts.push(`<p><strong>${await renderInline((token as Tokens.Heading).tokens)}</strong></p>`);
        break;
      /* Raw HTML, tables and everything else become the text somebody typed. */
      default:
        parts.push(`<p>${esc((token as { raw?: string }).raw ?? '')}</p>`);
    }
  }

  return parts.join('');
}

export async function renderComment(markdown: string): Promise<string> {
  const tokens = marked.lexer(markdown, { gfm: true, breaks: true });
  return renderBlocks(tokens);
}

/** The plain text of a comment, for a notification email or a moderation list. */
export function commentExcerpt(markdown: string, max = 160): string {
  const flat = markdown
    .replace(/```[\s\S]*?```/g, ' code ')
    .replace(/[#>*_`~\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}\u2026`;
}
