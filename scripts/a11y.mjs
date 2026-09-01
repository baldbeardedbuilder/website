/*
  Accessibility gate.

  WCAG 2.2 AA is a decision, not an aspiration, so it is checked by a script that fails
  the build rather than by remembering to look. Every page archetype is audited in the
  fixed Type Stage palette at phone and desktop widths.

  Run it against a built dist. `pnpm a11y` serves dist and does the rest.
*/

import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { serveDist } from './lib/serve-dist.mjs';
import { serveDev } from './lib/serve-dev.mjs';
import { firstArticlePage, firstDisasterPage } from './lib/archetypes.mjs';
import { provenanceSuffix } from './lib/provenance.mjs';

/* One of each archetype rather than all 199 pages. Adding a new archetype means adding
   a line here, which is the point. */
const PAGES = [
  ['home', '/'],
  ['all content', '/all/'],
  ['articles', '/articles/'],
  ['videos', '/videos/'],
  ['topics', '/topics/'],
  ['topic index', '/csharp/'],
  ['topic filtered', '/csharp/articles/'],
  /*
    The article archetype is discovered rather than named. It used to be a hardcoded slug
    sitting in this file alongside the disaster function that exists to avoid exactly that,
    and it named a post in the src/content submodule, which Michael edits without touching
    this repo. One rename for SEO and this gate went red on a build where no site code
    changed, which is decision 117 straight through the middle.
  */
  ...firstArticlePage(),
  /*
    A video detail page exists only when there is a video_pages row for it, and there are
    none until Michael writes one. So there is no video page archetype to audit yet, and
    hardcoding a URL here just makes the gate fail on a page nobody asked for. The videos
    index above is the surface every video actually has.
  */
  ['disaster archive', '/dev-disasters/'],
  ['disaster filtered', '/dev-disasters/error/newest/'],
  /*
    The disaster detail archetype is discovered rather than named, for the same reason the
    video page above is absent: it only exists once somebody has told a story and Michael
    has published it, and there are none yet. Both discoveries live in scripts/lib/archetypes.mjs
    with the history of why.
  */
  ...firstDisasterPage(),
  ['about', '/about/'],
  ['conduct', '/conduct/'],
  ['privacy', '/privacy/'],
  ['terms', '/terms/'],
  ['uses', '/uses/'],
  ['search', '/search/'],
  ['not found', '/404.html']
];

/*
  Fail closed on the article. Discovery is the fix for a hardcoded slug, but a discovery
  that quietly finds nothing is worse than the slug was: the gate would go green having
  skipped the most read page type on the site, and its summary line would not change.
  There is no state of this repo where zero articles are built.
*/
if (!PAGES.some(([label]) => label === 'article')) {
  console.error(
    'no article page was discovered in dist, so the most read page type went unaudited. ' +
      'Check src/config/taxonomy.json has entries and that pnpm build ran first.'
  );
  process.exit(1);
}

/*
  Pages that are rendered on demand, so they are not in dist and a static audit cannot see
  them. Unsubscribe reads and validates its token on the server, so it needs a real render.
*/
const ON_DEMAND = [
  ['unsubscribe missing token', '/unsubscribe/'],
  [
    'unsubscribe confirmation',
    '/unsubscribe/?token=00000000-0000-4000-8000-000000000000&kind=comment_reply'
  ]
];

const VIEWPORTS = [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 900 }]
];

const THEMES = ['type-stage'];

/*
  The 31 July unexplained failure, now explained.

  A run reported contrast violations on h4 elements and would not reproduce: four full
  runs, plus 96 targeted audits on /csharp/ and 64 on /videos/ using an exact mirror of
  this file's browser setup, all clean. The note left here at the time cleared the body
  colour transition at app.css:34 on the grounds that every context is opened with
  reducedMotion 'reduce' and app.css collapses transition-duration to .01ms under that.

  That was the wrong conclusion, and it took the same failure coming back to show it. In
  October the gate failed on the home page on .row > h3 under bbb-light, on the
  pull_request run, while the push run for the identical commit passed. Reproduced
  locally at last by throttling the CPU 8x: one run in eight, with axe reporting fgColor
  #1b1a18 against bgColor #15171a, which is the foreground of the theme being left on the
  background of the theme being arrived at.

  So the transition was the cause. .01ms is a duration, not an absence, and the swap still
  has to wait for a frame before anything reads the new colour. On an unloaded machine
  that frame is immediate and the old 50ms sleep covered it. On a loaded CI runner it is
  not, and the sleep covered nothing. Both symptoms were the first few headings of a
  block, which is simply what axe reaches first.

  Two things came out of it, both below in applyTheme and record. The theme swap now waits
  for the transitions it starts and then proves the page is wearing the theme before
  auditing, and violations now print the data axe already had. The other half of the old
  note stands and is worth repeating: the rule id was cut from that first run by
  `Select-Object -Last 2`, so never do that to a gate that can fail.
*/

const { server, base } = await serveDist();
const dev = await serveDev();
const browser = await chromium.launch();

/* One list of absolute URLs, so the audit loop does not have to care which server a page
   came from. Everything after this point treats them identically, which is the point. */
const TARGETS = [
  ...PAGES.map(([label, path]) => [label, base + path]),
  ...ON_DEMAND.map(([label, path]) => [label, dev.base + path])
];

const failures = [];
let checks = 0;
let disclosuresOpened = 0;
/* Which pages the focus checks below actually reached, so zero can fail rather than pass. */
const focusChecked = new Set();

for (const [vpName, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();

  for (const [label, url] of TARGETS) {
    const res = await page.goto(url, { waitUntil: 'load' });
    if (!res || res.status() !== 200) {
      failures.push(`${label} ${url} returned ${res ? res.status() : 'no response'}`);
      continue;
    }

    /* Expressive Code decides whether a code block needs keyboard access from a resize
       observer with a 250ms debounce followed by an idle callback, so auditing straight
       after load reports a missing tabindex that arrives moments later. Waiting is the
       honest fix. Racing the page is how a gate produces failures nobody can reproduce. */
    await page.waitForTimeout(600);

    /* Same reasoning, different race. target-size measures rendered boxes, and a nav link
       in a fallback font is a different size from the same link in the real one. Without
       this the gate fails a handful of runs in a hundred with a wall of target-size
       violations nobody changed anything to cause. */
    await page.evaluate(() => document.fonts.ready);

    /*
      Vite can briefly show its own error overlay while the on demand route finishes
      compiling. Give that one clean retry, then report Vite's message instead of asking
      axe to grade the overlay as if it were the site.
    */
    const viteError = () =>
      page.evaluate(() => {
        const root = document.querySelector('vite-error-overlay')?.shadowRoot;
        if (!root) return null;

        const message = root.getElementById('message-content')?.textContent?.trim();
        const stack = root.getElementById('stack-content')?.textContent?.trim();
        return [message, stack?.split('\n').slice(0, 8).join('\n')]
          .filter(Boolean)
          .join('\n');
      });

    let devError = await viteError();
    if (devError) {
      const retry = await page.reload({ waitUntil: 'load' });
      if (!retry || retry.status() !== 200) {
        failures.push(`${label} ${url} returned ${retry ? retry.status() : 'no response'} on retry`);
        continue;
      }

      await page.waitForTimeout(600);
      await page.evaluate(() => document.fonts.ready);
      devError = await viteError();
      if (devError) {
        failures.push(`${label} [${vpName}] Vite failed to render the route after a retry:\n${devError}`);
        continue;
      }
    }

    /*
      Find every disclosure on the page and tag it, so its contents can be audited.

      Found while adding the share menu. A closed disclosure is display: none, so axe walks
      straight past it, which means the theme picker menu has been on every page of this
      site since phase one and has never once been audited. Sixteen swatch rows and two
      group labels, in three themes, checked by nothing.

      The panels are opened rather than the triggers clicked, because a click that lands on
      the wrong element navigates and the audit then reports on a different page. Every
      disclosure on this site is either a details element or a panel hidden by the hidden
      attribute, and both open the same way from here.
    */
    const panels = await page.evaluate(() => {
      const found = [];

      for (const d of document.querySelectorAll('details')) {
        d.setAttribute('data-a11y-disclosure', String(found.length));
        found.push({ index: found.length, kind: 'details', label: d.className || 'details' });
      }

      for (const trigger of document.querySelectorAll('[aria-expanded="false"][aria-controls]')) {
        const panel = document.getElementById(trigger.getAttribute('aria-controls'));
        if (!panel) continue;
        panel.setAttribute('data-a11y-disclosure', String(found.length));
        trigger.setAttribute('data-a11y-trigger', String(found.length));
        found.push({ index: found.length, kind: 'panel', label: panel.className || panel.id });
      }

      return found;
    });

    /**
     * Open or close one tagged disclosure, in the page.
     *
     * One at a time, and closed again afterwards, which is the whole point. Opening them
     * all and leaving them open put a 581 pixel panel over the top of the videos page and
     * axe then reported contrast failures on the first three titles underneath it. That is
     * text no reader can see, because the panel painting over it is opaque, so the finding
     * was an artifact of the audit rather than anything wrong with the page. It failed
     * about two runs in five, which is worse than failing every time: a gate that goes red
     * at random teaches people to press the button again.
     */
    const setDisclosure = ({ index, open }) => {
      const el = document.querySelector(`[data-a11y-disclosure="${index}"]`);
      if (!el) return;

      if (el.tagName === 'DETAILS') {
        el.open = open;
        return;
      }

      el.hidden = !open;
      const trigger = document.querySelector(`[data-a11y-trigger="${index}"]`);
      if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    /*
      Switch theme and wait for the page to actually be wearing it.

      Setting data-theme is instant. The colours it implies are not: app.css transitions
      background-color, color and border-color on body and on several block classes, so
      the swap starts a transition and everything reads the old colour until that
      transition's first frame lands. reducedMotion 'reduce' collapses the duration to
      .01ms, which is not the same as collapsing it to nothing, and a frame on a loaded
      CI runner can be a long way off.

      That is what was failing this gate at random. Measured with the CPU throttled 8x,
      one run in eight reported color-contrast on the home page with fgColor #1b1a18 and
      bgColor #15171a: the foreground of the theme being left and the background of the
      theme being arrived at, 1.03:1, on text nobody has ever seen rendered that way. The
      earlier note in this file guessed at the transition and cleared it. The evidence
      now says it was the transition, and that a 50ms sleep is the wrong instrument.

      So this waits for the thing itself rather than for a number of milliseconds. Two
      frames to get the change through style, layout and paint, then the transitions it
      started, awaited by their own promises. Animations are left alone deliberately: a
      looping one never finishes and would hang the gate.
    */
    const applyTheme = async (theme) => {
      await page.evaluate(async (t) => {
        document.documentElement.setAttribute('data-theme', t);

        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );

        await Promise.all(
          document
            .getAnimations()
            .filter((a) => a instanceof CSSTransition)
            /* A transition on an element that goes away rejects. That is settled too. */
            .map((a) => a.finished.catch(() => {}))
        );
      }, theme);

      /*
        Then prove it, rather than assume it. body is color: var(--fg), so the computed
        colour of body and the --fg of the theme now on the document have to agree. If
        they ever do not, this reports which two disagree, which is a diagnosis. The
        alternative is what CI got: a serious contrast violation on three headings and
        no way to tell it was never real.
      */
      return page.evaluate((t) => {
        const root = document.documentElement;
        const applied = root.getAttribute('data-theme');
        if (applied !== t) return `theme was set to ${t} but the document is wearing ${applied}`;

        const hex = getComputedStyle(root).getPropertyValue('--fg').trim();
        const n = parseInt(hex.slice(1), 16);
        const want = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
        const got = getComputedStyle(document.body).color;

        return got === want ? null : `body is ${got} but ${t} says --fg is ${want}`;
      }, theme);
    };

    for (const theme of THEMES) {
      const unsettled = await applyTheme(theme);
      if (unsettled) {
        failures.push(`${label} [${vpName}, ${theme}] never settled: ${unsettled}`);
        continue;
      }

      const audit = () =>
        new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          /* YouTube's own player markup, which we do not control and cannot fix. The iframe
             element itself is still audited, and the title assertion below covers the part
             that is actually ours. */
          .exclude('iframe[src*="youtube"]');

      /*
        Whatever axe measured, printed next to what it measured it on.

        The contrast rule carries the two colours, the ratio it got and the one it wanted,
        and without them a failure is a selector and a shrug. This gate has now twice
        produced a finding nobody could act on, and both times the data that explains it
        was sitting in the results object being thrown away.
      */
      const record = (results, where) => {
        for (const v of results.violations) {
          failures.push(
            `${label}${where} [${vpName}, ${theme}] ${v.id} (${v.impact}): ${v.help}\n` +
              v.nodes
                .slice(0, 3)
                .map((n) => {
                  const why = [...n.any, ...n.all, ...n.none]
                    .filter((c) => c.data && typeof c.data === 'object')
                    .map((c) => JSON.stringify(c.data))
                    .join(' ');
                  return `      ${n.target.join(' ')}${why ? `\n        ${why}` : ''}`;
                })
                .join('\n')
          );
        }
      };

      /* The page as it actually ships, with every disclosure shut. */
      record(await audit().analyze(), '');
      checks++;

      /*
        Then each disclosure's own contents, scoped to the panel. Scoping is what keeps the
        two questions apart: whether the page is accessible, and whether the thing a reader
        opens on top of it is. Auditing the whole page with a panel open answers neither
        cleanly, because half the page is behind an opaque box.
      */
      for (const panel of panels) {
        await page.evaluate(setDisclosure, { index: panel.index, open: true });

        record(
          await audit().include(`[data-a11y-disclosure="${panel.index}"]`).analyze(),
          ` (${panel.label} open)`
        );
        checks++;
        disclosuresOpened++;

        await page.evaluate(setDisclosure, { index: panel.index, open: false });
      }
    }

    /* Excluding the embed's insides means nothing checks the frame itself any more, and
       a frame with no name is the one accessibility failure an embed can have that is
       genuinely ours to fix. */
    const unnamedFrames = await page.evaluate(() =>
      [...document.querySelectorAll('iframe')].filter((f) => !f.title?.trim()).length
    );
    if (unnamedFrames > 0) {
      failures.push(`${label} [${vpName}] has ${unnamedFrames} iframes with no title`);
    }

    /* Reflow, WCAG 2.2 success criterion 1.4.10. A page that scrolls sideways on a phone
       fails whether or not axe has a rule for it. */
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    if (overflow > 1) {
      failures.push(`${label} [${vpName}] scrolls sideways by ${overflow}px`);
    }

    /* Axe does not measure focus appearance, so prove keyboard focus remains visible. */
    const ringed = (el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    };

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.keyboard.press('Tab');

    const onKeys = await page.evaluate((fn) => {
      const test = new Function('el', `return (${fn})(el)`);
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return { skip: false, ring: false, visible: false };

      const rect = active.getBoundingClientRect();
      return {
        skip: active.matches('.skip'),
        ring: test(active),
        visible: rect.width > 0 && rect.height > 0
      };
    }, ringed.toString());
    focusChecked.add(label);

    if (!onKeys.skip) failures.push(`${label} [${vpName}] does not focus the skip link first`);
    if (!onKeys.ring) failures.push(`${label} [${vpName}] keyboard focus draws no ring`);
    if (!onKeys.visible) failures.push(`${label} [${vpName}] keyboard focus is not visible`);
  }

  await context.close();
}

await browser.close();
server.close();
dev.stop();

if (failures.length) {
  console.error(`\naxe found ${failures.length} problems across ${checks} audits:\n`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}

if (disclosuresOpened === 0) {
  /*
    Fail closed. Every page carries the theme picker, so zero here means the opening step
    stopped matching anything and the gate has gone back to auditing only what was already
    on screen, which is the state this was written to end.
  */
  console.error('no disclosures were opened, so their contents were never audited.');
  process.exit(1);
}

if (focusChecked.size < 1) {
  /*
    Fail closed, same reasoning as the disclosures above. Zero means a selector stopped
    matching and the focus checks quietly measured nothing while still reporting clean.
  */
  console.error(
    `focus rings were only checked on ${focusChecked.size} page(s): ${[...focusChecked].join(', ') || 'none'}.`
  );
  process.exit(1);
}

console.log(
  `axe clean across ${checks} audits, ${TARGETS.length * VIEWPORTS.length} page loads and ` +
    `${disclosuresOpened} disclosure audits, each scoped to the panel and shut again after. ` +
    `Focus rings checked on ${focusChecked.size} page(s).` +
    provenanceSuffix()
);
