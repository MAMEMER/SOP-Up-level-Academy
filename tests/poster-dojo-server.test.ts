import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

type Write = { collection: string; data: Record<string, unknown> };
let poster: Record<string, unknown> = {};
let version = 'current';
let writes: Write[] = [];
const db = {
  collection: (collection: string) => ({ doc: (id = 'generated') => ({ collection, id }) }),
  runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
    const pending: Write[] = [];
    await fn({
      get: async () => ({ data: () => poster, updateTime: { toDate: () => ({ toISOString: () => version }), nanoseconds: 1 } }),
      create: (ref: { collection: string }, data: Record<string, unknown>) => pending.push({ collection: ref.collection, data }),
      update: (ref: { collection: string }, data: Record<string, unknown>) => pending.push({ collection: ref.collection, data })
    });
    writes = pending;
  }
};
(globalThis as typeof globalThis & { dojoTestDb: unknown }).dojoTestDb = db;
const hooks = registerHooks({ resolve(specifier, context, next) {
  let source: string | undefined;
  if (specifier === 'server-only') source = 'export {}';
  if (specifier === './firebase-admin.ts' && context.parentURL?.endsWith('/poster-dojo-server.ts')) source = 'export const adminDb = () => globalThis.dojoTestDb';
  if (specifier === 'firebase-admin/firestore') source = 'export const FieldValue = {serverTimestamp: () => "server-time"}';
  return source ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
} });
const { submitReview } = await import('../lib/poster-dojo-server.ts');
hooks.deregister();
const reviewer = { email: 'namenrw@gmail.com', name: 'เนม' };
const input = { id: 'poster', version: 'current:1', action: 'revise', comment: 'เพิ่มขนาดชื่อ', asRule: true, severity: '🟡' };

test('Rework, reviewer stamp and optional rubric are committed together', async () => {
  poster = { name: 'weekly', status: 'pending', rework_round: 2 };
  await submitReview(input, reviewer);
  assert.deepEqual(writes.map(w => w.collection), ['claude-tasks', 'poster-dojo', 'poster-rubric']);
  assert.equal(writes[0].data.engine, 'codex');
  assert.equal(writes[0].data.source, 'rework');
  assert.equal(writes[0].data.rework_round, 3);
  assert.equal(writes[1].data.status, 'reworking');
  assert.equal(writes[1].data.reviewed_by_name, 'เนม');
  assert.equal(writes[2].data.rule, input.comment);
  assert.ok(writes.every(w => Object.values(w.data).every(v => v !== undefined)));
});

test('A stale second reviewer or already dispatched poster cannot enqueue another rework', async () => {
  for (const scenario of [{ status: 'pending', version: 'changed' }, { status: 'reworking', version: 'current' }]) {
    poster = { name: 'weekly', status: scenario.status }; version = scenario.version; writes = [];
    await assert.rejects(submitReview(input, reviewer), /conflict/);
    assert.deepEqual(writes, []);
  }
  version = 'current';
});

test('Rejection requires a comment; approval needs no task; revise can reuse the previous comment', async () => {
  poster = { name: 'weekly', status: 'pending' };
  await assert.rejects(submitReview({ ...input, action: 'rejected', comment: '', asRule: false }, reviewer), /comment_required/);
  await submitReview({ ...input, action: 'approved', comment: '', asRule: false }, reviewer);
  assert.deepEqual(writes.map(w => w.collection), ['poster-dojo']);
  assert.equal(writes[0].data.status, 'approved');
  poster = { ...poster, champ_comment: 'ความเห็นเดิม' };
  await submitReview({ ...input, comment: '', asRule: false }, reviewer);
  assert.equal(writes[0].data.champ_comment, 'ความเห็นเดิม');
});
