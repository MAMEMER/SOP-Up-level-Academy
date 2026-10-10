import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reworkTask, reviewable, sortPosters, type Poster } from '../lib/poster-dojo.ts';
import { adminSectionsFor } from '../lib/admin-sitemap.ts';
import { canManageStaffAccounts } from '../lib/owner.ts';

test('Dojo queues pending and revise first, newest first, without archived posters', () => {
  const posts = [['old', 'pending', 1], ['new', 'revise', 9], ['approved', 'approved', 20], ['archived', 'archived', 30], ['working', 'reworking', 10]].map(([id, status, updatedAt]) => ({ id, status, updatedAt }) as Poster);
  assert.deepEqual(sortPosters(posts).map(p => p.id), ['new', 'old', 'approved', 'working']);
  assert.equal(reviewable('reworking'), false);
});

test('Rework task preserves the standalone console instructions exactly without annotations', () => {
  const source = readFileSync(new URL('../lib/poster-dojo.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('status <name> pending'));
  const task = reworkTask('weekly', 2, 'เพิ่มขนาดชื่อ');
  assert.equal(task.split('\n').length, 5);
  assert.ok(task.includes('practice/weekly.html'));
  assert.ok(task.includes('รอบแก้ที่ 2'));
  assert.ok(task.includes('คอมเมนต์ Champ (สิ่งที่ต้องแก้): "เพิ่มขนาดชื่อ"'));
  assert.ok(task.includes('ห้ามแก้ sample ต้นฉบับ'));
});

test('Dojo uses the existing staff-admin permission for Name and Muk', () => {
  for (const email of ['namenrw@gmail.com', 'sin.sirisa@gmail.com', 'champ.championest@gmail.com']) assert.equal(canManageStaffAccounts(email), true);
  assert.ok(!adminSectionsFor({ owner: false, staffAdmin: false }).flatMap(s => s.links).some(l => l.href === '/admin/dojo'));
  assert.ok(adminSectionsFor({ owner: false, staffAdmin: true }).flatMap(s => s.links).some(l => l.href === '/admin/dojo'));
});
