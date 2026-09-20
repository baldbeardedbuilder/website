# Deploying v2

Everything on this branch is behaviour preserving except one thing, and it is not the
thing that looks risky.

## The change nobody asked for

`netlify.toml` moved from `public/` to the repository root. That part is a tidy up.

The file on `main` was three `[[redirects]]` blocks and nothing else. The file on this
branch also carries:

```toml
[build]
  command = "pnpm build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "24"
  PNPM_VERSION = "9"
```

Redirects can be honoured from the publish directory, which is why the old location
worked and why all three rules were measured live in production before the move. Build
configuration cannot be, by simple ordering: the build has already finished by the time
anything reads `dist/`. So those four settings were inert in `public/` and are live at
the root.

`netlify.toml` takes precedence over the Netlify UI for every key it declares. Production
currently gets its build command, publish directory and Node version from the UI. After
this merge it gets them from the file.

This is probably an improvement, config as code usually is. But it has to be a decision
rather than a side effect of a file move.

### What has to be confirmed before merge

I could not read this myself. The Netlify MCP server returns 401 and the CLI session has
expired, so both paths to the UI need somebody signed in. Site settings, Build and
deploy, Build settings:

| UI field | What the file will impose | Why it matters if they differ |
| --- | --- | --- |
| Build command | `pnpm build` | Runs `prebuild` (`pnpm gen`: fonts, taxonomy, redirects), then `astro build`, then `postbuild` (pagefind). |
| Publish directory | `dist` | Astro's default. A different value here would mean production has been publishing something else. |
| Node version | `24` | `package.json` says `engines.node: ">=22"`. Everything on this branch was built and tested on 24.14.0. A UI value of 20 or 22 means production has never run the toolchain this branch was written against. |
| pnpm version | `9` | `package.json` pins `packageManager: "pnpm@9.1.1"`. |

Three of those are gated by tests in `tests/redirects.test.mjs`, so the two files cannot
drift apart later. None of them can tell you what the UI says today. That is the question
for Michael, and the answer belongs in the pull request description.

If the UI values match, the merge changes nothing and the file becomes the record. If
they differ, the difference is the interesting part of this pull request and the redirects
are the boring part.

## The bbb.dev short links

1,627 short links run through one host matched rule. It is the highest risk line in the
repository and it deserves the caution, but the risk is narrower than it first looks.

It is two independent facts, and only one of them is changing.

**A. Is `netlify.toml` at the repository root read and parsed on this site?** New. This is
the entire behavioural change. It has nothing to do with hostnames, so a branch deploy
can prove it.

**B. Is the host rule syntax valid, and does `bbb.dev` route to this site?** Unchanged.
Nothing here touches DNS or the domain to site binding, and the same rule text, character
for character, is serving production right now. Measured before the move:

```
https://bbb.dev/gh   301   the redirect function
```

B is already true and is not being modified, so proving A proves the conjunction.

### Proving A

`netlify.toml` carries a permanent probe rule on `/_netlify-toml-is-read/`. The path
appears nowhere in `public/_redirects` and nowhere in the built site, which
`tests/redirects.test.mjs` enforces, so a 301 on it can only have come from
`netlify.toml`. If it 301s, the file was read and its redirect table was parsed, which
means the `bbb.dev` rule is loaded too.

`scripts/verify-deploy.mjs` checks it on every run against a base URL. One request.

The rule is permanent on purpose rather than being deleted before merge. It makes "is
this file being read" answerable forever with a single request, on a file carrying 1,627
short links, and the assumption it tests has already turned out to be wrong once.

There is a second piece of evidence sitting in the deploy log, free: a branch deploy that
built with `pnpm build` on Node 24 read the root `netlify.toml`, because that is the only
place those values exist.

### What this does not prove

That Netlify applies host matching on the production hostname identically from the new
location. That mechanism is unchanged and currently serving, so the residual is small,
but it is not zero. Hence the post merge run below.

## Merge sequence

1. Read the UI build settings and record them in the pull request description. Decide,
   rather than discover, whether the four values in the file are the ones production
   should get.
2. Branch deploy, then `node scripts/verify-deploy.mjs <branch-url> --all`. This checks
   the probe and every rule in `_redirects`, and asserts each one is a single hop onto a
   page that returns 200. A rule that hops cleanly into a 404 fails here.
3. Check the branch deploy log says pnpm and Node 24.
4. `node scripts/verify-deploy.mjs --shortlinks` against production. Read only. This is
   the before reading.
5. Merge.
6. `node scripts/verify-deploy.mjs --shortlinks` again, immediately. If it differs from
   the before reading, the merge broke 1,627 links.
7. `node scripts/verify-deploy.mjs https://baldbeardedbuilder.com --all`.

## Rollback trigger

Step 6 differing from step 4 is the trigger, and the answer is to roll back rather than
to debug forwards. Netlify keeps the previous production deploy, so the rollback is a
button and it restores the old `public/netlify.toml` along with everything else.
