/*
  Share gate. One click, one intent.

  share_intents is named after the thing actually measured because Michael has to be able
  to read the number and believe it. That puts the burden on the number being right, and
  the bug shape that would make it wrong has no symptom at all: no error, nothing wrong in
  the markup, nothing a reader would ever notice. It just counts two.

  Astro emits an is:inline script once per component instance rather than once per page. A
  page with two share menus therefore runs the wiring twice, and if that wiring is not
  scoped to its own instance both copies bind the first menu, doubling everything recorded
  from it while the second menu records nothing and never unhides its copy button.

  Nothing on the site carries two menus today. That is precisely why this gate does not
  wait for one: it builds a second instance, re-runs the script the way Astro would emit
  it, and counts the beacons. A second control near the top of a long article is a normal
  next ask, and by then the count would already be wrong with nothing to see.

  Run against a built dist, after pnpm build.
*/

import { chromium } from 'playwright';
import { serveDist } from './lib/serve-dist.mjs';
import { firstArticlePage } from './lib/archetypes.mjs';
import { provenanceSuffix } from './lib/provenance.mjs';

const [article] = firstArticlePage();

if (!article) {
  console.error(
    'no built article page was found in dist, so the share gate proved nothing. ' +
      'Check src/config/taxonomy.json has entries and that pnpm build ran first.'
  );
  process.exit(1);
}

const [, path] = article;

const { server, base } = await serveDist();
const browser = await chromium.launch();
/*
  Clipboard writes need the permission even on a secure context, and localhost is one. The
  copy path returns early when writeText throws, so without this the copy assertions below
  would fail for a reason that has nothing to do with what is under test.
*/
const context = await browser.newContext({ permissions: ['clipboard-write'] });
const page = await context.newPage();

/*
  Beacons are counted in the page rather than at Supabase. The edge function is external
  to this static build, so a real request would depend on deployment configuration.
  What is under test is how many times the handler runs.
*/
await page.addInitScript(() => {
  window.__beacons = [];
  navigator.sendBeacon = (url, blob) => {
    window.__beacons.push({
      url: String(url),
      body: blob && blob.text ? blob.text() : Promise.resolve('')
    });
    return true;
  };
});

await page.goto(base + path, { waitUntil: 'load' });

const failures = [];
let clicks = 0;

const beacons = () =>
  page.evaluate(() =>
    Promise.all(window.__beacons.map(async (b) => ({ url: b.url, body: await b.body })))
  );

const reset = () => page.evaluate(() => void (window.__beacons.length = 0));

/**
 * Click one platform in one menu and return everything that was sent.
 *
 * The click is dispatched directly rather than through Playwright's actionability checks,
 * because what is being counted is listeners and not whether a box is on screen. The
 * accessibility gate already opens every menu and audits what is inside it.
 */
async function share(index, platform) {
  await reset();
  await page.evaluate(
    ({ index, platform }) => {
      const host = document.querySelectorAll('[data-share]')[index];
      host.open = true;
      host.querySelector(`[data-share-platform="${platform}"]`).click();
    },
    { index, platform }
  );
  clicks++;
  return beacons();
}

function expectOne(sent, label, platform, key) {
  if (sent.length !== 1) {
    failures.push(
      `${label}: ${platform} recorded ${sent.length} intents, not 1. ` +
        `An intent count that is wrong by a whole multiple is the failure share_intents ` +
        `was named to prevent, and it has no other symptom.`
    );
    return;
  }

  const body = JSON.parse(sent[0].body || '{}');

  if (body.platform !== platform) {
    failures.push(`${label}: recorded platform ${JSON.stringify(body.platform)}, expected ${platform}.`);
  }

  if (key !== undefined && body.key !== key) {
    failures.push(
      `${label}: recorded key ${JSON.stringify(body.key)}, expected ${JSON.stringify(key)}. ` +
        `A menu wired to another menu's target attributes every share to the wrong page.`
    );
  }

  if (!sent[0].url.endsWith('/functions/v1/share')) {
    failures.push(`${label}: beaconed ${sent[0].url}, expected the Supabase share function.`);
  }
}

/*
  Navigation is suppressed at the document, in the capture phase. preventDefault stops the
  default action and nothing else, so the anchor's own click listener still runs, which is
  the listener being counted. Without this the four outbound links open tabs.
*/
await page.evaluate(() =>
  document.addEventListener('click', (e) => e.preventDefault(), true)
);

const firstKey = await page.evaluate(() => document.querySelector('[data-share]').dataset.key);

/*
  Counted before anything is clicked, which is the point of doing it here rather than
  alongside the copy assertions further down. The first press is what would delete a mark,
  so a count taken after it cannot tell a menu that shipped four marks from a menu that
  shipped five and lost one.
*/
const marksAtLoad = await page.evaluate(
  () => document.querySelectorAll('[data-share] .share-menu .mk').length
);

if (marksAtLoad !== 5) {
  failures.push(
    `one menu: ${marksAtLoad} destination marks in the menu before any interaction, ` +
      `expected 5. Decision 128 puts one on each of the four platforms and a link icon ` +
      `on copy.`
  );
}

/* One menu, the page as it actually ships. */
expectOne(await share(0, 'x'), 'one menu', 'x', firstKey);
expectOne(await share(0, 'bluesky'), 'one menu', 'bluesky', firstKey);
expectOne(await share(0, 'copy'), 'one menu', 'copy', firstKey);

const copiedLabel = await page.evaluate(() => {
  const copy = document.querySelector('[data-share] .copy');
  const label = copy.querySelector('.copy-label') || copy;
  return { text: label.textContent.trim(), done: copy.getAttribute('data-done'), hidden: copy.hidden };
});

if (copiedLabel.hidden) {
  failures.push('one menu: the copy button is still hidden, so the clipboard path never ran.');
}

if (copiedLabel.text !== 'Copied' || copiedLabel.done !== '1') {
  failures.push(
    `one menu: after copying, the button reads ${JSON.stringify(copiedLabel.text)} ` +
      `with data-done ${JSON.stringify(copiedLabel.done)}. Decision 121 says the label is ` +
      `the feedback, so if it does not change the reader gets nothing at all.`
  );
}

/*
  Decision 128 put a mark inside the copy button, and the label swap is what threatens it.

  The button reports by changing its own words to "Copied" and back 1600ms later. An
  element whose text is replaced wholesale loses every child it had, so a swap written to
  the button rather than to a span inside it deletes the mark on first press and restores
  the words without it. Nothing fails. No error, no broken layout, no wrong count. The
  control keeps working and quietly stops having an icon, once, and only for the readers
  who actually used it, which is the subset least likely to mention it.

  Two moments are checked rather than one. Straight after the click, because the first
  write is what deletes a child and therefore the exact instant the mark goes. And after
  the timer has reverted the label, because that is the state the reader is left with for
  the rest of the session. Checking only the second would still catch it, checking only
  the first would not tell you whether the revert put anything back.
*/
const marksWhileCopied = await page.evaluate(
  () => document.querySelectorAll('[data-share] .share-menu .mk').length
);

if (marksWhileCopied !== 5) {
  failures.push(
    `one menu: ${marksWhileCopied} destination marks while the button reads Copied, expected 5. ` +
      `The first write is the one that deletes a child, so this is the moment the mark ` +
      `disappears rather than the moment a reader would notice.`
  );
}

await page.waitForFunction(
  () => !document.querySelector('[data-share] .copy').hasAttribute('data-done'),
  null,
  { timeout: 5000 }
);

const afterTimer = await page.evaluate(() => {
  const copy = document.querySelector('[data-share] .copy');
  const label = copy.querySelector('.copy-label') || copy;
  return { marks: copy.querySelectorAll('.mk').length, text: label.textContent.trim() };
});

if (afterTimer.marks !== 1) {
  failures.push(
    `one menu: the copy button has ${afterTimer.marks} marks once its label has reverted, ` +
      `expected 1. The label swap took the icon with it, which is what happens when the ` +
      `text of an element that owns children is replaced wholesale. Write to a span inside ` +
      `the button, not to the button.`
  );
}

if (afterTimer.text !== 'Copy link') {
  failures.push(
    `one menu: the copy button reads ${JSON.stringify(afterTimer.text)} after the timer, ` +
      `expected "Copy link".`
  );
}

/*
  Now the second instance. Astro would render another details element and emit another copy
  of the script, so both are built here: the claim attribute is stripped and the copy button
  re-hidden, because a freshly rendered menu carries neither.
*/
const added = await page.evaluate(() => {
  const host = document.querySelector('[data-share]');
  const clone = host.cloneNode(true);

  clone.removeAttribute('data-share-ready');
  clone.dataset.key = 'second-menu';
  clone.open = false;

  const copy = clone.querySelector('.copy');
  copy.hidden = true;
  /*
    Written to the span rather than the button for the same reason the component is: this
    reset is what a freshly rendered menu looks like, and a reset that deletes the mark
    would hand the second menu a state Astro never produces, then test that.
  */
  const label = copy.querySelector('.copy-label') || copy;
  label.textContent = 'Copy link';
  copy.removeAttribute('data-done');

  host.parentNode.appendChild(clone);

  /*
    Found by content rather than by position, so this keeps working if the script moves,
    and matched on a string both the scoped and the unscoped versions contain, so a
    regression fails as a doubled count rather than as a gate that cannot find its subject.
  */
  const source = [...document.querySelectorAll('script')]
    .map((s) => s.textContent)
    .find((t) => t && t.includes('data-share-platform') && t.includes('sendBeacon'));

  if (!source) return { menus: document.querySelectorAll('[data-share]').length, ran: false };

  const el = document.createElement('script');
  el.textContent = source;
  document.body.appendChild(el);

  return { menus: document.querySelectorAll('[data-share]').length, ran: true };
});

if (!added.ran) {
  failures.push(
    'the share menu script could not be found in the page, so the second instance was ' +
      'never simulated and this gate proved nothing.'
  );
}

if (added.menus !== 2) {
  failures.push(`expected 2 share menus after cloning, found ${added.menus}.`);
}

if (added.ran && added.menus === 2) {
  /* The original must not have picked up a second set of listeners. */
  expectOne(await share(0, 'x'), 'two menus, first', 'x', firstKey);
  expectOne(await share(0, 'copy'), 'two menus, first', 'copy', firstKey);

  /* And the new one must be wired to itself. */
  expectOne(await share(1, 'linkedin'), 'two menus, second', 'linkedin', 'second-menu');
  expectOne(await share(1, 'facebook'), 'two menus, second', 'facebook', 'second-menu');

  const secondCopy = await page.evaluate(
    () => document.querySelectorAll('[data-share]')[1].querySelector('.copy').hidden
  );

  if (secondCopy) {
    failures.push(
      'two menus, second: its copy button is still hidden. The script that would have ' +
        'unhidden it unhid the first menu instead, which is the same bug seen from the ' +
        'other side.'
    );
  }
}

await browser.close();
server.close();

if (failures.length) {
  console.error('share problems:\n' + failures.map((f) => `  ${f}`).join('\n'));
  process.exit(1);
}

if (clicks === 0) {
  console.error('no share controls were clicked, so this gate proved nothing.');
  process.exit(1);
}

console.log(
  `share is clean across ${clicks} clicks on ${path}, one intent each, with ${marksAtLoad} ` +
    `destination marks at load, ${marksWhileCopied} while the button reads Copied and the ` +
    `link icon still there after it reverts, and a second menu and a second copy of its ` +
    `script on the page.` +
    provenanceSuffix()
);
