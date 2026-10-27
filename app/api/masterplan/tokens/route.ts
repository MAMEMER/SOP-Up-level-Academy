import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, fail, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { mpStore } from "../../../../lib/masterplan-store.ts";
import { createToken, revokeToken } from "../../../../lib/masterplan-tokens.ts";

// My AI tokens. Session-authenticated (never by token): each member creates/revokes only
// their own. The raw token is returned once on create and never stored.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  try {
    const created = await createToken(mpStore, auth.member.key, body.label);
    if (!created.ok) return bad(created.error);
    return NextResponse.json(
      { ok: true, token: created.token, hash: created.record.hash, label: created.record.label },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return storeError(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  try {
    const done = await revokeToken(mpStore, auth.member.key, text(body.hash));
    return done ? NextResponse.json({ ok: true }) : fail(404, "ไม่พบ token นี้ของคุณ");
  } catch (error) {
    return storeError(error);
  }
}
