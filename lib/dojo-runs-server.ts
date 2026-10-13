import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin.ts';
import {
  RUN_STAGES, STAGE_KEYS, canApprove, canRedo, newRunStages, proceedPatch, proceedStage, redoPatch, runName, sortRuns,
  type Run, type RunItem, type StageKey
} from './dojo-runs.ts';

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const url = (v: unknown) => (/^https:\/\//.test(text(v)) ? text(v) : '');
const ms = (v: any) => v?.toMillis?.() ?? (typeof v === 'number' ? v : 0);
const items = (v: unknown): RunItem[] =>
  Array.isArray(v) ? v.map(i => ({ img: url(i?.img), caption: text(i?.caption) })).filter(i => i.img) : [];

function toRun(id: string, p: FirebaseFirestore.DocumentData, version: string): Run {
  const st = p.stages || {};
  return {
    id, name: text(p.name) || id.replace(/^run-/, ''), title: text(p.title) || id, status: text(p.status) || 'new',
    round: Number(p.round) || 1,
    brief: { job: text(p.brief?.job), query: text(p.brief?.query), note: text(p.brief?.note) },
    redo: p.redo ? { from: text(p.redo.from), note: text(p.redo.note), by: text(p.redo.by), ...(p.redo.pick != null ? { pick: Number(p.redo.pick) } : {}) } : null,
    stages: RUN_STAGES.map(s => {
      const x = st[s.key] || {};
      return {
        key: s.key, label: s.label, status: text(x.status) || 'todo', summary: text(x.summary), at: ms(x.at),
        progress: typeof x.progress === 'number' ? x.progress : null, progressNote: text(x.progress_note), progressAt: ms(x.progress_at),
        items: items(x.items), cands: items(x.cands), picked: x.picked != null ? Number(x.picked) : null,
        metrics: Array.isArray(x.metrics) ? x.metrics.map((m: any) => ({ label: text(m?.label), value: text(m?.value) })) : [],
        links: Array.isArray(x.links) ? x.links.map((l: any) => ({ url: url(l?.url), label: text(l?.label) })).filter((l: any) => l.url) : []
      };
    }),
    log: Array.isArray(p.log) ? p.log.map((l: any) => ({ stage: text(l?.stage), note: text(l?.note), by: text(l?.by), at: Number(l?.at) || 0, ...(l?.pick != null ? { pick: Number(l.pick) } : {}) })) : [],
    live: p.live ? { state: text(p.live.state), at: ms(p.live.at), started: p.live.started ? ms(p.live.started) : null } : null,
    updatedAt: ms(p.updated_at) || ms(p.created_at), version
  };
}
const versionOf = (d: FirebaseFirestore.DocumentSnapshot) => d.updateTime!.toDate().toISOString() + ':' + d.updateTime!.nanoseconds;

export async function listRuns(): Promise<Run[]> {
  const snap = await adminDb().collection('poster-dojo').where('kind', '==', 'run').get();
  return sortRuns(snap.docs.map(d => toRun(d.id, d.data(), versionOf(d))));
}

type Who = { email: string; name: string };

export async function redoRun(id: string, stage: StageKey, note: string, pick: number | undefined, who: Who) {
  const db = adminDb();
  const ref = db.collection('poster-dojo').doc(id);
  await db.runTransaction(async tx => {
    const d = await tx.get(ref);
    const p = d.data();
    if (!p || p.kind !== 'run') throw new Error('not_found');
    const run = toRun(id, p, versionOf(d));
    if (!canRedo(run)) throw new Error('conflict');
    if (pick != null && (stage !== 'ref' || pick < 1 || pick > run.stages[0].cands.length)) throw new Error('invalid_request');
    if (pick == null && !note.trim()) throw new Error('comment_required');
    const at = Date.now();
    const existing = STAGE_KEYS.filter(k => p.stages?.[k]);
    tx.update(ref, {
      ...redoPatch(stage, existing, note.trim(), who.email, at, pick),
      log: FieldValue.arrayUnion({ stage, note: note.trim(), by: who.email, by_name: who.name, at, ...(pick != null ? { pick } : {}) }),
      updated_at: FieldValue.serverTimestamp()
    });
  });
}

export async function proceedRun(id: string, stage: StageKey, who: Who) {
  const db = adminDb();
  const ref = db.collection('poster-dojo').doc(id);
  await db.runTransaction(async tx => {
    const d = await tx.get(ref);
    const p = d.data();
    if (!p || p.kind !== 'run') throw new Error('not_found');
    if (proceedStage(toRun(id, p, versionOf(d))) !== stage) throw new Error('conflict');
    tx.update(ref, {
      ...proceedPatch(stage),
      log: FieldValue.arrayUnion({ stage, note: 'ผ่านขั้นนี้ ไปต่อ', by: who.email, by_name: who.name, at: Date.now() }),
      updated_at: FieldValue.serverTimestamp()
    });
  });
}

export async function approveRun(id: string, who: Who) {
  const db = adminDb();
  const ref = db.collection('poster-dojo').doc(id);
  await db.runTransaction(async tx => {
    const d = await tx.get(ref);
    const p = d.data();
    if (!p || p.kind !== 'run') throw new Error('not_found');
    if (!canApprove(toRun(id, p, versionOf(d)))) throw new Error('conflict');
    tx.update(ref, {
      status: 'approved', approved_by: who.email, approved_by_name: who.name,
      log: FieldValue.arrayUnion({ stage: 'template', note: 'ผ่าน ลงเทมเพลต', by: who.email, by_name: who.name, at: Date.now() }),
      updated_at: FieldValue.serverTimestamp()
    });
  });
}

export async function createRun(job: string, jobLabel: string, query: string, note: string, who: Who) {
  const name = runName(job, Date.now());
  await adminDb().collection('poster-dojo').doc('run-' + name).create({
    kind: 'run', name, title: jobLabel + (note ? ' · ' + note.slice(0, 40) : ''), status: 'new', round: 1,
    brief: { job, query, note }, stages: newRunStages(),
    created_by: who.email, created_by_name: who.name,
    created_at: FieldValue.serverTimestamp(), updated_at: FieldValue.serverTimestamp()
  });
  return 'run-' + name;
}
