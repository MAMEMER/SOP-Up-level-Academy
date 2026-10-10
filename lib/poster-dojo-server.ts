import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.ts';
import { reworkTask, reviewable, sortPosters, type Poster } from './poster-dojo.ts';
const text = (v: unknown) => typeof v === 'string' ? v : '';
const url = (v: unknown) => /^https?:\/\//.test(text(v)) ? text(v) : '';
export async function listPosters(): Promise<Poster[]> {
  const snap = await adminDb().collection('poster-dojo').get();
  return sortPosters(snap.docs.map(doc => {
    const p = doc.data();
    return { id: doc.id, name: text(p.name) || doc.id, status: text(p.status) || 'pending',
      imageUrl: url(p.imageUrl), refImage: url(p.refImage), refUrl: url(p.refUrl), sidebysideUrl: url(p.sidebysideUrl),
      grade: typeof p.grade === 'number' ? p.grade : null, verdict: text(p.verdict),
      fails: Array.isArray(p.fails) ? p.fails.map(f => typeof f === 'string' ? f : text(f?.what)).filter(Boolean) : [],
      champ_comment: text(p.champ_comment), reviewed_by: text(p.reviewed_by), rework_round: Number(p.rework_round) || 0,
      updatedAt: p.updated_at?.toMillis?.() ?? p.created_at?.toMillis?.() ?? 0,
      version: doc.updateTime!.toDate().toISOString() + ':' + doc.updateTime!.nanoseconds };
  }));
}
export async function submitReview(input: { id: string; version: string; action: string; comment: string; asRule: boolean; severity: string }, reviewer: { email: string; name: string }) {
  const db = adminDb();
  const ref = db.collection('poster-dojo').doc(input.id);
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const p = doc.data();
    if (!p) throw new Error('not_found');
    const version = doc.updateTime!.toDate().toISOString() + ':' + doc.updateTime!.nanoseconds;
    if (version !== input.version || !reviewable(p.status || 'pending')) throw new Error('conflict');
    const comment = input.comment.trim() || (input.action === 'revise' ? text(p.champ_comment) : '');
    if ((input.action !== 'approved' || input.asRule) && !comment) throw new Error('comment_required');
    const now = FieldValue.serverTimestamp();
    const name = text(p.name) || input.id;
    const round = (Number(p.rework_round) || 0) + 1;
    if (input.action === 'revise') tx.create(db.collection('claude-tasks').doc(), {
      task: reworkTask(name, round, comment), project: 'poster-dojo', status: 'pending', source: 'rework', engine: 'codex',
      posterId: input.id, posterName: name, champ_comment: comment, rework_round: round, annotations: [],
      created_by: reviewer.email, created_by_name: reviewer.name, created_at: now
    });
    tx.update(ref, { status: input.action === 'revise' ? 'reworking' : input.action,
      champ_comment: comment || null, reviewed_by: reviewer.email, reviewed_by_name: reviewer.name,
      reviewed_at: now, updated_at: now,
      ...(input.action === 'revise' ? { rework_round: round, rework_dispatched_at: now } : {}) });
    if (input.asRule) tx.create(db.collection('poster-rubric').doc(), {
      rule: comment, severity: input.severity, fromPoster: name, game: p.game ?? null, applied: false,
      by: reviewer.email, by_name: reviewer.name, created_at: now
    });
  });
}
