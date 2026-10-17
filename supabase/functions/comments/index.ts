import { serviceClient, serviceConfigured } from '../_shared/client.ts';
import { empty, json, preflight } from '../_shared/http.ts';
import { isTargetKey, isTargetKind } from '../_shared/request.ts';
import { order, type CommentStatus, type CommentView } from '../../../src/lib/thread.ts';

const BODY_MAX = 10_000;
const EDIT_WINDOW_MINUTES = 15;

async function readThread(kind: 'content', key: string) {
  if (!serviceConfigured()) return { comments: [], total: 0 };

  const db = serviceClient();
  const [{ data: rows, error: commentsError }, { data: likeRows, error: likesError }] =
    await Promise.all([
      db
        .from('comments_public')
        .select('*')
        .eq('target_kind', kind)
        .eq('target_key', key)
        .order('created_at', { ascending: true }),
      db.from('like_counts').select('target_key, likes').eq('target_kind', 'comment')
    ]);

  if (commentsError || likesError) throw new Error('Could not read comment thread.');

  const likes = new Map<string, number>();
  for (const row of likeRows ?? []) {
    if (row.target_key) likes.set(row.target_key, Number(row.likes ?? 0));
  }

  const all: CommentView[] = (rows ?? [])
    .filter((row) => row.id && row.status)
    .map((row) => ({
      id: row.id!,
      parentId: row.parent_id,
      createdAt: row.created_at!,
      editedAt: row.edited_at,
      status: row.status as CommentStatus,
      html: null,
      tombstone: row.tombstone,
      authorHandle: row.author_handle,
      authorName: row.author_name,
      authorAvatar: row.author_avatar,
      likes: likes.get(row.id!) ?? 0,
      mine: false,
      held: row.status === 'held'
    }));

  const readable = all.filter((comment) => comment.status !== 'held');
  const visibleIds = readable.filter((comment) => comment.status === 'visible').map((c) => c.id);

  if (visibleIds.length) {
    const { data: bodies, error } = await db
      .from('comments')
      .select('id, body_html')
      .in('id', visibleIds)
      .eq('status', 'visible');

    if (error) throw new Error('Could not read comment bodies.');
    const htmlById = new Map((bodies ?? []).map((row) => [row.id, row.body_html]));
    for (const comment of readable) comment.html = htmlById.get(comment.id) ?? null;
  }

  return {
    comments: order(readable),
    total: all.filter((comment) => comment.status === 'visible').length
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') {
    if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
      return json({ error: 'Comments are no longer available.' }, 410);
    }
    return empty(405);
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const key = url.searchParams.get('key');
  if (!isTargetKind(kind) || !isTargetKey(key)) {
    return json({ error: 'Unknown target.' }, 400);
  }

  try {
    const thread = await readThread(kind, key);
    return json({
      ...thread,
      nudge: null,
      viewer: null,
      limits: { bodyMax: BODY_MAX, editWindowMinutes: EDIT_WINDOW_MINUTES }
    });
  } catch (error) {
    console.error('[comments] read failed', error);
    return json({ error: 'Comments are not available right now.' }, 503);
  }
});
