/*
  The report endpoint.

  A plain form post, not JSON, because the report form has to work with JavaScript off.
  That is not a nicety: the moment somebody needs this page is a bad moment, and a form
  that quietly needs a working script bundle is a form that fails exactly then.

  Anybody can file one. Reporting has no account requirement.
*/

import type { APIRoute } from 'astro';
import { serviceClient, supabaseWritable } from '../../lib/supabase';
import { clientIp, hashIp } from '../../lib/reader';

export const prerender = false;

/* The form's own vocabulary, mapped onto the kinds the table accepts. */
const KIND_MAP: Record<string, string> = {
  comment: 'comment',
  content: 'other',
  disaster: 'disaster',
  profile: 'profile',
  conduct: 'conduct',
  offsite: 'other'
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  Enough to stop somebody hiding a comment by filing the same report over and over, since
  three of them auto hides it. Keyed by hashed address rather than account, because
  reporting does not need an account and the limit has to hold for the anonymous path too.
*/
const REPORTS_PER_HOUR = 5;

const back = (query: string) => new Response(null, { status: 303, headers: { location: `/report/${query}` } });

export const POST: APIRoute = async (context) => {
  if (!supabaseWritable) return back('?sent=off');

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return back('?sent=bad');
  }

  const what = String(form.get('what') ?? '');
  const kind = KIND_MAP[what] ?? 'other';
  const why = String(form.get('why') ?? '').trim();
  const link = String(form.get('link') ?? '').trim();
  const ref = String(form.get('ref') ?? '').trim();
  const urgent = form.get('urgent') !== null;

  if (!why) return back('?sent=empty');

  const db = serviceClient();
  const hashed = hashIp(clientIp(context));

  const { count } = await db
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_hash', hashed)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((count ?? 0) >= REPORTS_PER_HOUR) return back('?sent=slow');

  /*
    target_ref is what the auto hide trigger reads, so for a comment it has to be the
    comment id and nothing else. The human readable link goes in the details, where it
    helps me and cannot be mistaken for something the database should act on.
  */
  const targetRef = kind === 'comment' && UUID_RE.test(ref) ? ref : link || null;

  const details = [
    link ? `Link: ${link}` : null,
    urgent ? 'Marked urgent by the reporter.' : null
  ]
    .filter(Boolean)
    .join('\n');

  const { error } = await db.from('reports').insert({
    kind,
    target_ref: targetRef,
    reason: why.slice(0, 5000),
    details: details || null,
    reporter_id: null,
    reporter_hash: hashed
  });

  if (error) return back('?sent=failed');
  return back('?sent=1');
};
