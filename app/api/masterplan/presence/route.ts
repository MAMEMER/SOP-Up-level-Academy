import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, fail, readBody, storeError } from "../../../../lib/masterplan-api.ts";
import { deleteOne, listAll, putOne } from "../../../../lib/masterplan-store.ts";
import { isPresenceMember, presenceId, validatePresence, type OwnerPresence } from "../../../../lib/owner-presence.ts";

// Owner เข้าสาขา (mp_presence) — each owner sets only their OWN day; the member comes from the session.
//  GET                       → all marks
//  PUT { date, branch }      → branch "bangkae" | "senafest", or "" = ไม่เข้า (removes the mark)

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ ok: true, presence: await listAll<OwnerPresence>("mp_presence") });
  } catch (error) {
    return storeError(error);
  }
}

export async function PUT(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const member = auth.member.key;
  if (!isPresenceMember(member)) return fail(403, "ช่องนี้สำหรับแชมป์ เนม และมุก");
  const checked = validatePresence(await readBody(request));
  if (!checked.ok) return bad(checked.error);
  const id = presenceId(checked.date, member);
  try {
    if (!checked.branch) {
      await deleteOne("mp_presence", id);
    } else {
      await putOne<OwnerPresence>("mp_presence", id, {
        id,
        date: checked.date,
        member,
        branch: checked.branch,
        updatedAt: new Date().toISOString()
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeError(error);
  }
}
