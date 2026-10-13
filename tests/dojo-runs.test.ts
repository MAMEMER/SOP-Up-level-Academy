import test from 'node:test';
import assert from 'node:assert/strict';
import { canApprove, canRedo, redoPatch, runName, sortRuns, STAGE_KEYS, type Run } from '../lib/dojo-runs.ts';
import { adminSectionsFor } from '../lib/admin-sitemap.ts';

test('Fixing a stage reruns it and marks only the later stages stale', () => {
  const p = redoPatch('copy', [...STAGE_KEYS], 'แถบคือภาพเดียว', 'sin.sirisa@gmail.com', 5);
  assert.equal(p.status, 'redo');
  assert.deepEqual(p.redo, { from: 'copy', note: 'แถบคือภาพเดียว', by: 'sin.sirisa@gmail.com', at: 5 });
  assert.equal(p['stages.copy.status'], 'redo');
  assert.equal(p['stages.adapt.status'], 'stale');
  assert.equal(p['stages.template.status'], 'stale');
  assert.equal(p['stages.ref.status'], undefined);
});

test('Picking another reference keeps the pick for the worker', () => {
  const p = redoPatch('ref', ['ref', 'copy'], '', 'champ', 1, 5) as { redo: { pick: number } };
  assert.equal(p.redo.pick, 5);
  assert.equal((p as Record<string, unknown>)['stages.adapt.status'], undefined);
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
  assert.deepEqual(proceedPatch('copy'), { status: 'continue', 'stages.copy.status': 'done' });
});
