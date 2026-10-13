import { NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/auth.ts';
import { canManageStaffAccounts } from '../../../../lib/owner.ts';
import { hasSessionSecret } from '../../../../lib/session-jwt.ts';
import { hasAdminCredentials } from '../../../../lib/firebase-admin.ts';
import { RUN_JOBS, STAGE_KEYS, type StageKey } from '../../../../lib/dojo-runs.ts';
import { approveRun, createRun, listRuns, proceedRun, redoRun } from '../../../../lib/dojo-runs-server.ts';
export const dynamic = 'force-dynamic';

async function access() {
  const user = await requireUser();
  return canManageStaffAccounts(user.actualEmail) && !user.isImpersonating && hasSessionSecret() ? user : null;
}
const KNOWN = ['not_found', 'conflict', 'comment_required', 'invalid_request'];
const CODE: Record<string, number> = { not_found: 404, conflict: 409, comment_required: 400, invalid_request: 400 };

export async function GET() {
  const user = await access();
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  try { return NextResponse.json({ runs: await listRuns() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'read_failed' }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await access();
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!hasAdminCredentials()) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
  const b = await request.json().catch(() => null);
  const who = { email: user.actualEmail, name: user.actualName };
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const validId = (v: unknown) => typeof v === 'string' && /^run-[\w-]{1,80}$/.test(v);
  try {
    if (b?.action === 'redo' && validId(b.id) && STAGE_KEYS.includes(b.stage) && str(b.note, 5000) &&
        (b.pick == null || Number.isInteger(b.pick))) {
      await redoRun(b.id, b.stage as StageKey, b.note, b.pick ?? undefined, who);
      return NextResponse.json({ ok: true });
    }
    if (b?.action === 'proceed' && validId(b.id) && STAGE_KEYS.includes(b.stage)) {
      await proceedRun(b.id, b.stage as StageKey, who);
      return NextResponse.json({ ok: true });
    }
    if (b?.action === 'approve' && validId(b.id)) {
      await approveRun(b.id, who);
      return NextResponse.json({ ok: true });
    }
    const job = RUN_JOBS.find(([k]) => k === b?.job);
    if (b?.action === 'create' && job && str(b.query, 200) && str(b.note, 1000)) {
      if (job[0] === 'other' && !b.note.trim()) return NextResponse.json({ error: 'comment_required' }, { status: 400 });
      return NextResponse.json({ ok: true, id: await createRun(job[0], job[1], b.query.trim(), b.note.trim(), who) });
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  } catch (e) {
    const error = e instanceof Error ? e.message : '';
    return KNOWN.includes(error)
      ? NextResponse.json({ error }, { status: CODE[error] })
      : NextResponse.json({ error: 'write_failed' }, { status: 500 });
  }
}
