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
  them. The report page reads its prefill on the server, which is what keeps it working
  with JavaScript off, and that is exactly why it must not be the one page nobody checks.
*/
const ON_DEMAND = [
  ['report', '/report/'],
  ['report prefilled', '/report/?type=content&target=%2Fcsharp%2F'],
  ['report sent', '/report/?sent=1'],
  ['report refused', '/report/?sent=slow'],
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

    /*
      Focus rings on the two controls that are not boxes, WCAG 2.2 success criterion 2.4.7.

      Here rather than in a script of its own because these two pages are prerender = false,
      so they write no file and this is the only gate with a dev server that can reach them.
      It is also the same subject: axe has no rule for focus appearance, so a ring that is
      drawn on the wrong element, or not drawn at all, passes every audit above.

      The defect it was written for shipped on both pages. `.field input:focus` had no
      exclusion for radios and checkboxes, so clicking an option drew a 2px square around a
      13px dot floating inside a much larger rounded chip, and it fired on :focus rather
      than :focus-visible so a mouse click drew it.

      Removing the ring outright was the literal request and would have failed 2.4.7, so
      what is asserted is that it moved rather than that it went away.

      Transitions are already settled here: every context is opened with reducedMotion
      'reduce' and app.css collapses transition-duration under it, so a computed style read
      straight after a state change is the settled one. That is measured in check:headings
      rather than assumed here.

      Clicks assert a transition rather than a state. Asserting "checked" after a click
      makes the answer depend on whether the fixture ships pre-ticked, and "no ring" only
      means something if the click landed at all.
    */
    const ringed = (el) => {
      const s = getComputedStyle(el);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    };

    if (await page.locator('.pick input').first().count()) {
      focusChecked.add(label);

      const atRest = await page.evaluate((fn) => {
        const test = new Function('el', `return (${fn})(el)`);
        return [...document.querySelectorAll('.pick')].filter(
          (chip) => test(chip) || test(chip.querySelector('input'))
        ).length;
      }, ringed.toString());
      if (atRest > 0) failures.push(`${label} [${vpName}] draws a focus ring on ${atRest} option(s) at rest`);

      /* An option that is not already selected, so the click has somewhere to move to. */
      const target = await page.evaluate(() => {
        const chips = [...document.querySelectorAll('.pick')];
        const chip = chips.find((c) => !c.querySelector('input').checked) ?? chips[0];
        chip.setAttribute('data-focus-probe', '');
        return chips.indexOf(chip);
      });
      if (target < 0) failures.push(`${label} [${vpName}] has options but none could be probed`);

      await page.locator('[data-focus-probe]').click();
      const onMouse = await page.evaluate((fn) => {
        const test = new Function('el', `return (${fn})(el)`);
        const chip = document.querySelector('[data-focus-probe]');
        const input = chip.querySelector('input');
        return { checked: input.checked, chip: test(chip), dot: test(input) };
      }, ringed.toString());

      if (!onMouse.checked) failures.push(`${label} [${vpName}] clicking an option did not select it`);
      if (onMouse.dot) failures.push(`${label} [${vpName}] a mouse click rings the radio dot`);
      if (onMouse.chip) failures.push(`${label} [${vpName}] a mouse click rings the option chip`);

      /*
        Keyboard next. A real key press first, because :focus-visible follows the modality of
        the last interaction, and the click above has just set that to mouse. Focusing after
        the press is what a reader arrowing through the group ends up in.
      */
      await page.keyboard.press('Tab');
      await page.evaluate(() => document.querySelector('[data-focus-probe] input').focus());
      const onKeys = await page.evaluate((fn) => {
        const test = new Function('el', `return (${fn})(el)`);
        const chip = document.querySelector('[data-focus-probe]');
        return { chip: test(chip), dot: test(chip.querySelector('input')) };
      }, ringed.toString());

      if (!onKeys.chip) failures.push(`${label} [${vpName}] a keyboard focused option draws no ring at all`);
      if (onKeys.dot) failures.push(`${label} [${vpName}] a keyboard focused option rings the dot as well as the chip`);

      await page.evaluate(() => document.querySelector('[data-focus-probe]')?.removeAttribute('data-focus-probe'));
    }

    if (await page.locator('.consent input').first().count()) {
      focusChecked.add(label);

      const before = await page.locator('.consent input').first().isChecked();
      await page.locator('.consent input').first().click();
      const consent = await page.evaluate((fn) => {
        const test = new Function('el', `return (${fn})(el)`);
        const input = document.querySelector('.consent input');
        return { checked: input.checked, ring: test(input) };
      }, ringed.toString());

      if (consent.checked === before) failures.push(`${label} [${vpName}] clicking a consent box did not toggle it`);
      if (consent.ring) failures.push(`${label} [${vpName}] a mouse click rings the consent checkbox`);
    }
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
    Fail closed, same reasoning as the disclosures above. /report/ carries these controls,
    so zero means a selector stopped matching and the focus checks quietly measured nothing
    while still reporting clean.
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
