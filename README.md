# baldbeardedbuilder.com

The personal site of Michael Jolley, the Bald Bearded Builder. Articles, videos,
dev disasters and the .NET Drip signup. Built with Astro, deployed on Netlify,
with Supabase behind the parts that need an account.

## Running it

```sh
pnpm install
pnpm dev
```

That serves on `localhost:4321`. Use pnpm, not npm.

Versions are pinned in two places on purpose and they have to agree: `packageManager`
in `package.json` (currently `pnpm@9.1.1`) and `PNPM_VERSION` in `netlify.toml`
(currently `9`). Bumping one without the other means local and production build
with different tooling, which is the kind of difference that shows up as a broken
deploy and nothing else. `netlify.toml` also pins `NODE_VERSION = "24"`, while
`engines` asks only for Node 22 or newer, so local can be older than production.

## The content is a submodule

`src/content` is a git submodule pointing at `michaeljolley/content`, which is a
private repository. Without it every collection is empty, the site builds to
almost nothing, and any check you run passes for the wrong reason.

```sh
git submodule update --init --recursive
```

Treat it as read only from here. Anything that would mean editing frontmatter
across the submodule belongs in `src/config/` instead.

CI needs its own credential to read it, since the default `GITHUB_TOKEN` is scoped
to this repository and cannot clone another one. That is the secret
`CONTENT_DEPLOY_KEY`, and it holds the private half of a read only deploy key on
`michaeljolley/content` rather than a personal access token. The CI step prints the
four steps to create one when the secret is missing.

A key rather than a token on purpose. A fine grained token expires at twelve months
at the most and dies with the account that issued it, so it brings this same failure
back later and silently. Netlify solved the same problem on the same pair of
repositories in 2024 with a deploy key, so the precedent was already live.

## Generated files, and why the build fights you about them

`pnpm gen` runs automatically before every build and at the start of `pnpm dev`.
It writes:

| Output | From |
| :-- | :-- |
| `src/styles/fonts.generated.css` | `scripts/gen-fonts.mjs` |
| `src/config/taxonomy.json` | `scripts/gen-taxonomy.mjs` |
| `public/_redirects` | `scripts/gen-redirects.mjs` |

**Never hand edit any of those.** Edit the generator. `pnpm gen:check` fails the
build if a generated file differs from what its generator produces, which is
what stops a hand edit surviving to production.

## Site colors and code highlighting

Edit `src/styles/type-stage.css` to change the fixed site palette. Article code
blocks and comments share the syntax scopes in `src/lib/code-theme.mjs`, which
reference those CSS variables. Neither file is generated.

## Checks

```sh
pnpm test              # unit and redirect tests
pnpm check             # astro check
pnpm check:migrations  # the SQL chain is self contained
pnpm check:dist        # parked routes, sitemap and Pagefind agree with the routes
pnpm check:layout      # thumbnail crop and dead space, measured in a browser
pnpm a11y              # axe, WCAG 2.2 AA
pnpm perf              # Lighthouse budget
```

`pnpm check:dist`, `check:layout`, `a11y` and `perf` all read `dist`, so run
`pnpm build` first.

`pnpm verify:deploy` runs against a deployed URL rather than a local build. It is
the only check that can catch a Netlify setting being wrong, because everything
else passes happily on a machine where those settings do not apply.

## Further reading

- `docs/deploy.md` for Netlify build settings and the branch deploy.
- `docs/new-project.md` for standing up the Supabase project, including the
  GitHub OAuth callback trap that repoints production sign in if you get it
  wrong.
- `docs/backfill.md` for data imports and `docs/notifications.md` for email operations.
