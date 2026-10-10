import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Invariant scanner ignores Dojo instruction paths but still rejects CSV traversal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dojo-invariants-'));
  try {
    writeFileSync(join(dir, 'git'), '#!/bin/sh\ncase "$*" in\n*performance-source-files*) printf "%s\\n" "$TEST_CSV_DIFF" ;;\n*) printf "%s\\n" "$TEST_FULL_DIFF" ;;\nesac\n', { mode: 0o755 });
    const run = (csv: string) => spawnSync('bash', ['scripts/check-invariants.sh'], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_FULL_DIFF: '+import "../lib/poster-dojo.ts";\n+"copy ../uplevel-poster-template/samples/<name>.html"', TEST_CSV_DIFF: csv } });
    assert.equal(run('').status, 0);
    const dangerous = run('+const destination = "../private.csv";');
    assert.equal(dangerous.status, 1);
    assert.match(dangerous.stdout, /path traversal/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
