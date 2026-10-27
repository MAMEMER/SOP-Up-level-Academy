import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { putOne } from "../../../../lib/masterplan-store.ts";
import { checkDocSize, type MpScratch } from "../../../../lib/masterplan.ts";

// กระดาษทด — each member writes only their OWN scratchpad (key from the session).

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const markdown = text(body.markdown);
  const size = checkDocSize(markdown);
  if (!size.ok) return bad(size.error);
  const updatedAt = new Date().toISOString();
  try {
    await putOne<MpScratch>("mp_scratch", auth.member.key, { member: auth.member.key, markdown, updatedAt });
    return NextResponse.json({ ok: true, updatedAt });
  } catch (error) {
    return storeError(error);
  }
}
