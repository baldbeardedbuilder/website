# Supabase

The database behind the v2 site. **It is a brand new project and the ref has not been
handed over yet.**

Do not point any of this at `bvyerlczpakdlfvybkev`. That project serves the current live
site and `bbb.dev`, it holds 24,574 rows of stream history, and the v2 schema is scheduled
to be removed from it. Fourteen v2 migrations were applied there by mistake;
`supabase/reversal/20260731000000_remove_v2_from_legacy.sql` undoes that and is committed
unrun, because Michael decides when it executes.

## First run

Michael has to create the project first. `docs/new-project.md` is the click by click for
that: what to name it, which region and why, the GitHub and Twitch OAuth apps, the
redirect URL allowlist, and which Netlify deploy contexts each variable is scoped to.

Once the ref exists:

```
supabase link --project-ref <the-new-ref>
supabase db push
```

That is the whole thing. Push the entire chain, baseline included.

**Do not run `supabase migration repair`.** The old instructions said to, because the
baseline used to be a copy of a schema that already existed on production. It is not that
any more. It is trimmed down to the two legacy tables v2 genuinely reads, `streamEvents`
and `streamUsers`, and it has to actually run. Marking it applied without executing it
leaves those tables missing and every badge migration lands on top of nothing.

Everything else from the legacy schema was deliberately left out. An empty `shorturls` in
the new project is a live trap: repoint the redirect function at it and 1,627 short links
404 with no error anywhere, because the table exists and is simply empty. The full list of
what stayed behind, and why, is in the header of `20260101000000_baseline.sql`.

Both tables arrive empty. Michael loads them. `docs/backfill.md` is the spec.

## What is here

| Migration | What it does |
|---|---|
| `20260101000000_baseline` | `streamEvents` and `streamUsers` only. The rest of the legacy schema stays in the old project |
| `20260710000000_v2_schema` | Profiles, bans, disasters, comments, likes, reports, badges, notification preferences |
| `20260710000100_v2_rls` | Row level security. Deny by default, reads added back one at a time |
| `20260710000200_v2_seed` | Reserved handles, and a starting set of badges and thresholds |
| `20260710000300_v2_security_fixups` | Closes two advisor errors and takes the trigger functions off the RPC surface |
| `20260710000400_badge_tiers` | Badge families and tiers, so a shelf can show "Front Row III" and a locked IV |
| `20260710000500_streams_watched` | `streams_watched` and `twitch_first_seen`, the two numbers a profile cannot get from PostgREST |
| `20260710000600_comment_cascade_fix` | Stops one account deletion hard deleting other people's replies |
| `20260710000700_comment_bodies_and_likes` | Comment HTML rendered on write, and likes widened to cover comments |
| `20260710000800_report_rate_limit_hash` | Hashes the reporter token so a report cannot be traced back to a browser |
| `20260710000900_badge_thresholds_real_history` | Rescales every tier against the measured distribution, adds Cheerer |
| `20260710001000_badge_engine` | `badge_counts`, `grant_badges`, `badge_progress`, `backfill_badges` and the triggers |
| `20260710001100_badge_backfill_indexes` | `lower(login)` indexes. Turns the sweep from a sequential scan into milliseconds |
| `20260710001200_badge_backfill_schedule` | Nightly `pg_cron` sweep at 01:30 UTC |
| `20260710001300_video_transcripts` | Transcripts and chapters, read at build time |
| `20260801000000_featured` | `disasters.featured_at`, its index, and the trigger that grants the Featured badge |
| `20260806000000_notifications` | Legacy email queue, atomic claims, notification triggers, and unsubscribe RPC. The website no longer drains or sends these messages |

`supabase/reversal/` is not part of the chain and `db push` never sees it. That is
deliberate: a file that drops the whole v2 schema must not be able to run against the new
project by accident.

`supabase/deferred/` is not part of the chain. It is reserved for complete migrations that
are intentionally held from production. The disaster and notification schema remains in
the applied chain for existing database records and migration history, but the website no
longer reads or writes those features. Database notification triggers may still add rows
to `email_outbox`; there is no site function or endpoint to deliver or unsubscribe from
those messages.

`pnpm check:migrations` proves the chain is self contained, which matters now that the
baseline no longer carries the rest of the legacy schema.

## Regenerating types

`pnpm types` rewrites `src/lib/supabase/database.types.ts` from the live schema. It needs
`SUPABASE_PROJECT_REF` set and refuses to run against the legacy ref. Run it after every
migration and commit the result, so CI and a fresh clone never need a Supabase login.
`pnpm check` is what catches you if you forget.

## How writes work

They go through Astro API routes using the service role, not from the browser.

That is a deliberate posture rather than an unfinished one. A like needs its IP hashed
with a secret the browser must never hold. A comment needs a rate limit and a check on
how old its author's GitHub account is. A submission needs a title written for it before
it means anything. None of that can be expressed as a row level policy, and a policy
permissive enough to allow the insert would be a policy permissive enough to skip all of
it.

So the policies in `20260710000100_v2_rls` are read only, with exactly two exceptions,
both called out in the file: a person editing their own profile, and a person changing
their own notification preferences. The latter is retained with the legacy notification
schema but is no longer used by the website.

## Environment

The build and the routes need these. Never commit them.

| Name | Where | Why |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Netlify, local `.env` | Client and server |
| `PUBLIC_SUPABASE_ANON_KEY` | Netlify, local `.env` | Client reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify only, never `PUBLIC_` | Route writes |
| `LIKE_IP_SECRET` | Netlify only | HMAC key for `likes.ip_hash` |
| `SUPABASE_AUTH_GITHUB_CLIENT_ID` / `_SECRET` | Supabase dashboard | Sign in |
| `SUPABASE_AUTH_DISCORD_CLIENT_ID` / `_SECRET` | Supabase dashboard | Sign in |
| `SUPABASE_AUTH_TWITCH_CLIENT_ID` / `_SECRET` | Supabase dashboard | Sign in, and the badge shelf link |

`LIKE_IP_SECRET` is rotatable. Rotating it does not lose any likes, it just means the
people who already liked something could like it once more. That is the intended
tradeoff: the column is a dedupe token with a shelf life, not a stored IP address.

## Things worth knowing

**Disaster tables and notification database objects are retained but dormant from the
website's perspective.** They remain in the migration chain; no site routes, scheduled
functions, or email delivery code use them.

**Comments are keyed by collection id, never by URL.** A URL contains a topic, topics are
a judgement recorded in `src/config/taxonomy.json`, and that judgement will get revised.
The conversation has to survive that.

**Twitch is matched on user id, not login.** `streamEvents.login` is a Twitch login and
logins change. Matching by name would silently drop exactly the long time community
members the badge backfill exists to reward, and it would show up as an empty shelf
rather than as an error. The id is captured at link time into `profiles.twitch_user_id`.

**The badge names and thresholds are a proposal.** They live in `badges` and
`badge_rules` rather than in code so tuning one is an edit in Studio, not a deploy. They
need signing off before launch.

**Moderation happens in Studio.** Decision 7. There is no admin UI in v1, which is why
`disasters.status`, `comments.status` and `reports.status` are plain text columns with
readable values rather than integers or enums. Disaster moderation is no longer exposed
by the website.
