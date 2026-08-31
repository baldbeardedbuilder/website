/*
  Draining the notification queue.

  The database claims rows atomically before this code sees them. Every update includes
  the claim token, so an expired worker cannot settle a row another worker now owns.
  Resend also receives the queue dedupe key as its idempotency key, closing the remaining
  crash window between provider acceptance and the sent_at update.
*/

import type { SupabaseClient } from '@supabase/supabase-js';
import { mailDeliveryEnabled, sendMail, type Mail } from './mail';
import {
  backoffMinutes,
  renderNotification,
  MAX_ATTEMPTS,
  type NotificationKind
} from './notify-templates';
import { serviceClient, supabaseWritable } from './supabase';
import type { Database } from './supabase/database.types';

export const BATCH = 25;

interface OutboxRow {
  id: number;
  kind: NotificationKind;
  profile_id: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  created_at: string;
  attempts: number;
  last_attempt_at: string | null;
  claim_token: string;
}

async function currentEventPayload(
  db: SupabaseClient<Database>,
  row: OutboxRow
): Promise<Record<string, unknown> | null> {
  const disasterId = Number(row.payload.disaster_id);
  if (!Number.isSafeInteger(disasterId)) return null;

  const { data: disaster, error } = await db
    .from('disasters')
    .select('status, featured_at, slug, title, line')
    .eq('id', disasterId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not verify story for email row ${row.id}: ${error.code}`);
  }
  if (
    !disaster ||
    disaster.status !== 'published' ||
    (row.kind === 'story_featured' && !disaster.featured_at)
  ) {
    return null;
  }

  return {
    ...row.payload,
    slug: disaster.slug,
    title: disaster.title,
    line: disaster.line
  };
}

export interface DrainResult {
  enabled: boolean;
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  deadLetterIds: number[];
}

type OutboxUpdate = Database['public']['Tables']['email_outbox']['Update'];

async function updateClaim(
  db: SupabaseClient<Database>,
  row: OutboxRow,
  values: OutboxUpdate
): Promise<void> {
  const { data, error } = await db
    .from('email_outbox')
    .update({ ...values, claim_token: null, claimed_at: null })
    .eq('id', row.id)
    .eq('claim_token', row.claim_token)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Could not update claimed email row ${row.id}: ${error.code}`);
  if (!data) throw new Error(`Email row ${row.id} is no longer owned by this drain.`);
}

function nextAttemptAt(now: Date, attempts: number, retryAfterSeconds?: number): string {
  const backoffSeconds = backoffMinutes(attempts) * 60;
  const waitSeconds = Math.max(backoffSeconds, retryAfterSeconds ?? 0);
  return new Date(now.getTime() + waitSeconds * 1000).toISOString();
}

export async function drain(now = new Date()): Promise<DrainResult> {
  const result: DrainResult = {
    enabled: mailDeliveryEnabled,
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    deadLetterIds: []
  };

  if (!mailDeliveryEnabled) return result;
  if (!supabaseWritable) {
    throw new Error('Email delivery is enabled without Supabase service access.');
  }

  const db = serviceClient();
  const auth = serviceClient();
  const nowIso = now.toISOString();

  const { data: claimed, error: claimError } = await db.rpc('claim_email_batch', {
    p_now: nowIso,
    p_limit: BATCH
  });

  if (claimError) throw new Error(`Could not claim email rows: ${claimError.code}`);

  for (const raw of claimed ?? []) {
    const row = raw as unknown as OutboxRow;
    result.considered++;

    if (row.kind === 'comment_reply') {
      await updateClaim(db, row, {
        sent_at: nowIso,
        last_error: 'skipped: comments retired'
      });
      result.skipped++;
      continue;
    }

    const { data: prefs, error: prefsError } = await db
      .from('notification_prefs')
      .select('story_published, story_featured, unsubscribe_token')
      .eq('profile_id', row.profile_id)
      .maybeSingle();

    if (prefsError) {
      throw new Error(`Could not read preferences for email row ${row.id}: ${prefsError.code}`);
    }

    const wants = prefs
      ? row.kind === 'story_published'
        ? prefs.story_published
        : prefs.story_featured
      : false;

    if (!prefs || !wants) {
      await updateClaim(db, row, {
        sent_at: nowIso,
        last_error: 'skipped: opted out or no profile'
      });
      result.skipped++;
      continue;
    }

    const payload = await currentEventPayload(db, row);
    if (!payload) {
      await updateClaim(db, row, {
        sent_at: nowIso,
        last_error: 'skipped: event no longer resolves'
      });
      result.skipped++;
      continue;
    }

    const { data: user, error: userError } = await auth.auth.admin.getUserById(row.profile_id);
    if (userError) {
      throw new Error(`Could not read recipient for email row ${row.id}: ${userError.status ?? 'unknown'}`);
    }

    const to = user.user?.email;
    if (!to) {
      await updateClaim(db, row, {
        sent_at: nowIso,
        last_error: 'skipped: no address'
      });
      result.skipped++;
      continue;
    }

    const built = renderNotification(row.kind, payload, prefs.unsubscribe_token);
    if (!built) {
      await updateClaim(db, row, {
        sent_at: nowIso,
        last_error: 'skipped: event no longer resolves'
      });
      result.skipped++;
      continue;
    }

    const mail: Mail = {
      to,
      subject: built.subject,
      text: built.text,
      html: built.html,
      unsubscribeUrl: built.unsubscribeUrl,
      idempotencyKey: `bbb:${row.dedupe_key}`
    };

    const sent = await sendMail(mail);
    if (sent.ok) {
      await updateClaim(db, row, {
        sent_at: nowIso,
        last_error: null,
        last_attempt_at: nowIso
      });
      result.sent++;
      continue;
    }

    const attempts = row.attempts + 1;
    await updateClaim(db, row, {
      attempts,
      last_error: sent.error ?? 'provider_unknown',
      last_attempt_at: nowIso,
      next_attempt_at: nextAttemptAt(now, attempts, sent.retryAfterSeconds)
    });
    result.failed++;
  }

  const { data: deadLetters, error: deadLetterError } = await db
    .from('email_outbox')
    .select('id')
    .is('sent_at', null)
    .gte('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (deadLetterError) {
    throw new Error(`Could not inspect exhausted email rows: ${deadLetterError.code}`);
  }

  result.deadLetterIds = (deadLetters ?? []).map((row) => row.id);
  return result;
}
