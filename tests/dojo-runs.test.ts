import test from 'node:test';
import assert from 'node:assert/strict';
import { canApprove, canRedo, proceedStage, proceedPatch, redoPatch, runName, sortRuns, STAGE_KEYS, type Run } from '../lib/dojo-runs.ts';
import { adminSectionsFor } from '../lib/admin-sitemap.ts';

test('Fixing a stage reruns it and marks only the later stages stale', () => {
  const p = redoPatch('copy', [...STAGE_KEYS], 'แถบคือภาพเดียว', 'sin.sirisa@gmail.com', 5);
  assert.equal(p.status, 'redo');
  assert.deepEqual(p.redo, { from: 'copy', note: 'แถบคือภาพเดียว', by: 'sin.sirisa@gmail.com', at: 5 });
  assert.equal(p['stages.copy.status'], 'redo');
  assert.deepEqual(p['stages.adapt'], { order: 3, label: 'เปลี่ยนเป็น Up Level', status: 'todo', items: [] });
  assert.equal((p['stages.template'] as { status: string }).status, 'todo');
  assert.equal(p['stages.ref.status'], undefined);
  assert.equal(p['stages.ref'], undefined);
});

test('Picking another reference keeps the pick for the worker', () => {
  const p = redoPatch('ref', ['ref', 'copy'], '', 'champ', 1, 5) as { redo: { pick: number } };
  assert.equal(p.redo.pick, 5);
  assert.equal((p as Record<string, unknown>)['stages.adapt'], undefined);
});

test('Approve needs a finished Up Level version and is one-shot', () => {
  const st = (adapt: string) => [{ key: 'adapt', status: adapt }] as Run['stages'];
  assert.equal(canApprove({ status: 'waiting', stages: st('done') }), true);
  assert.equal(canApprove({ status: 'running', stages: st('running') }), false);
  assert.equal(canApprove({ status: 'approved', stages: st('done') }), false);
  assert.equal(canRedo({ status: 'approved' }), false);
  assert.equal(canRedo({ status: 'queued' }), true);
});

test('Run names use Thai time and runs waiting for review come first', () => {
  assert.equal(runName('weekly', Date.UTC(2026, 9, 13, 3, 30)), 'weekly-20261013-1030');
  const r = (id: string, status: string, updatedAt: number) => ({ id, status, updatedAt }) as Run;
  assert.deepEqual(sortRuns([r('a', 'approved', 9), r('b', 'waiting', 1), r('c', 'running', 5)]).map(x => x.id), ['b', 'a', 'c']);
});

test('Poster pages are in the owner menu for staff admins only', () => {
  const links = (staffAdmin: boolean) => adminSectionsFor({ owner: false, staffAdmin }).flatMap(s => s.links).map(l => l.href);
  assert.ok(links(true).includes('/admin/posters') && links(true).includes('/admin/posters/guide'));
  assert.ok(!links(false).includes('/admin/posters'));
});

test('Copy waits for a person before the pipeline moves on', async () => {
  const { proceedStage, proceedPatch } = await import('../lib/dojo-runs.ts');
  const st = (copy: string) => [{ key: 'copy', status: copy }, { key: 'review', status: 'todo' }] as Run['stages'];
  assert.equal(proceedStage({ status: 'waiting', stages: st('waiting') }), 'copy');
  assert.equal(proceedStage({ status: 'queued', stages: st('running') }), null);
  assert.equal(proceedStage({ status: 'waiting', stages: [{ key: 'review', status: 'waiting' }] as Run['stages'] }), null);
  assert.deepEqual(proceedPatch('copy'), { status: 'continue', redo: null, 'stages.copy.status': 'done', 'stages.copy.progress': 100, 'stages.copy.progress_note': '' });
});

test('The page can tell working from waiting in line and from stuck', async () => {
  const { liveState } = await import('../lib/dojo-runs.ts');
  const now = 10_000_000;
  assert.equal(liveState({ status: 'waiting', live: null }, now), 'idle');
  assert.equal(liveState({ status: 'redo', live: null }, now), 'queued');
  assert.equal(liveState({ status: 'queued', live: { state: 'pending', at: now, started: null } }, now), 'queued');
  assert.equal(liveState({ status: 'queued', live: { state: 'running', at: now - 30_000, started: now - 60_000 } }, now), 'working');
  assert.equal(liveState({ status: 'queued', live: { state: 'running', at: now - 7 * 60_000, started: null } }, now), 'stalled');
});

test('Proceed recovers finished outputs from a running stage only when the run is waiting', () => {
  for (const output of [
    { items: [{ img: 'https://example.com/copy.png', caption: '' }] },
    { cands: [{ img: 'https://example.com/ref.png', caption: '' }] },
    { progress: 99 }, { progress: 100 }, { hookFired: true }
  ]) {
    const stages: Run['stages'] = [{
      key: 'copy', label: 'copy', status: 'running', summary: '', at: 0,
      progress: null, progressNote: 'finishing', progressAt: 0,
      items: [], cands: [], picked: null, metrics: [], links: [], ...output
    }];
    const before = structuredClone(stages);
    assert.equal(proceedStage({ status: 'waiting', stages }), 'copy');
    assert.deepEqual(stages, before, 'resolving must not mutate UI or transaction inputs');
    for (const status of ['running', 'queued', 'continue', 'approved', 'done']) {
      assert.equal(proceedStage({ status, stages }), null);
    }
    const patch = proceedPatch('copy');
    assert.equal(patch['stages.copy.status'], 'done');
    assert.equal(patch['stages.copy.progress'], 100);
    assert.equal(patch['stages.copy.progress_note'], '');
  }
});

test('Proceed preserves the waiting gate and rejects unfinished or review stages', () => {
  const run = (stages: unknown) => ({ status: 'waiting', stages: stages as Run['stages'] });
  assert.equal(proceedStage(run([
    { key: 'ref', status: 'running', progress: 99 },
    { key: 'copy', status: 'waiting' }
  ])), 'copy');
  for (const stage of [
    { key: 'copy', status: 'running', progress: 98, items: [], cands: [], hookFired: false },
    { key: 'copy', status: 'running' },
    { key: 'copy', status: 'todo', progress: 100 },
    { key: 'copy', status: 'failed', progress: 100 },
    { key: 'review', status: 'running', progress: 100, hookFired: true },
    { key: 'review', status: 'waiting' }
  ]) assert.equal(proceedStage(run([stage])), null);
  assert.equal(proceedStage(run([])), null);
});
