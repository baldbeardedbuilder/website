/*
  The three ways in, in one place.

  The sign in route, the chooser page and the callback all need to agree on which
  providers exist, what each one is called out loud, and which profile columns it owns.
  Keeping that in three files is how you end up with a provider you can start but cannot
  finish.

  Decisions 4 and 13 used to say GitHub was the only way in and Twitch was link only.
  Both are revised. See the 20260809000000_multi_provider_signin migration for why.
*/

/*
  A sign in, not an integration. Every one of these asks for the profile and the email
  address and nothing else, because those are the account details the site displays.
  None of them can read a repository, join a server, or touch a stream.
*/
export const PROVIDER_SCOPES = {
  github: 'read:user user:email',
  discord: 'identify email',
  twitch: 'user:read:email'
} as const;

export type Provider = keyof typeof PROVIDER_SCOPES;

export const PROVIDERS = Object.keys(PROVIDER_SCOPES) as Provider[];

export function isProvider(value: string): value is Provider {
  return Object.hasOwn(PROVIDER_SCOPES, value);
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  github: 'GitHub',
  discord: 'Discord',
  twitch: 'Twitch'
};

/*
  What each one is actually for, said plainly on /account/.

  A connections list that says "Connected account" three times tells somebody nothing
  about why they might want to attach the two they have not. GitHub is the only provider
  that reports when the account was made, which is what decision 16's hold on a first
  comment reads. Twitch is what the badge backfill matches on. Discord earns nothing yet
  and says so, because implying otherwise is how a settings screen starts lying.
*/
export const PROVIDER_NOTES: Record<Provider, string> = {
  github: 'Account age, which decides whether a first comment waits',
  discord: 'Profile only, for now',
  twitch: 'Chat badges and stream history'
};

/** The profile column holding the display name for each provider. */
export const PROVIDER_LOGIN_COLUMNS = {
  github: 'github_login',
  discord: 'discord_login',
  twitch: 'twitch_login'
} as const satisfies Record<Provider, string>;

/*
  The profile column holding the provider's own id for each provider.

  This, not the login, is what says a provider is attached. A login is a display name: it
  is nullable, it changes, and a provider that declines to tell us one is still very much
  connected. Keying the connections list on the login is what let an attached Discord
  account read as "Not connected" while its id sat in the row next to it.
*/
export const PROVIDER_ID_COLUMNS = {
  github: 'github_id',
  discord: 'discord_id',
  twitch: 'twitch_user_id'
} as const satisfies Record<Provider, string>;

/*
  Where each provider puts the name we want, in the order we want it.

  Supabase normalises almost nothing here. Every provider's identity_data is whatever that
  provider's own claims mapper decided to emit, and the three we offer disagree completely:

    github   user_name and preferred_username are the login. name is the human's real name.
    twitch   name is the login. nickname is the display name, which is the login recased.
    discord  full_name is the username. name is username#discriminator. There is no
             user_name, no preferred_username and no nickname anywhere in it.

  One shared chain of guesses covered two of the three and silently returned nothing for
  Discord, so every Discord link wrote a null login. Guessing is the mistake. Each provider
  gets its own list, in its own order, and adding a fourth means reading its claims mapper
  once rather than hoping it looks like the others.

  github_created_at is deliberately not part of this. Only GitHub reports it, and the
  fallback for the other two lives in isNewAccount.
*/
const PROVIDER_LOGIN_KEYS: Record<Provider, string[]> = {
  github: ['user_name', 'preferred_username'],
  /* The login first, because the badge backfill matches on it. The display name is the
     same word recased for almost everybody, but "almost" is not a thing to match on. */
  twitch: ['name', 'full_name', 'nickname', 'slug'],
  /* The username, then username#discriminator, then the display name, which is the only
     one of the three that may contain spaces and is therefore the last resort. */
  discord: ['full_name', 'name', 'custom_claims.global_name', 'global_name']
};

/** Reads a dotted path, because Discord buries its display name in custom_claims. */
function claim(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value == null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

/**
 * The login to store for a provider, read out of one identity's `identity_data`.
 *
 * Returns null when the provider gave us nothing usable, which is a real answer and not a
 * failure: the identity is still attached, it just has no name to show.
 */
export function providerLogin(
  provider: Provider,
  identityData: Record<string, unknown> | null | undefined
): string | null {
  if (!identityData) return null;

  for (const key of PROVIDER_LOGIN_KEYS[provider]) {
    const value = claim(identityData, key);
    if (typeof value !== 'string') continue;

    /* Discord's `name` is username#discriminator, and no provider's login contains a
       hash, so this is safe to do to all of them. */
    const login = value.split('#')[0].trim().toLowerCase();
    if (login) return login;
  }

  return null;
}
