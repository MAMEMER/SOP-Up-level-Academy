import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../lib/masterplan-auth.ts";
import { bad, docId, fail, readBody, storeError, text } from "../../../../lib/masterplan-api.ts";
import { listAll, newId, putOne, updateOne } from "../../../../lib/masterplan-store.ts";
import { MASTERPLAN_MEMBERS } from "../../../../lib/masterplan-access.ts";
import { isColumn, validateCardDraft, type BoardCard } from "../../../../lib/team-board.ts";

// บอร์ดทีม (mp_board) — any Masterplan member may add, edit, move or remove any card.
//  GET                                     → all cards (the page polls this)
//  POST  { draft }                         → new card in ต้องทำ
//  PATCH { id, action: "move", column }
//  PATCH { id, action: "update", draft }
//  PATCH { id, action: "delete" | "restore" } → soft delete so the board can undo

export const dynamic = "force-dynamic";

const memberKeys = MASTERPLAN_MEMBERS.map((m) => m.key as string);

export async function GET() {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  try {
    const cards = await listAll<BoardCard>("mp_board");
    return NextResponse.json({ ok: true, cards: cards.filter((c) => !c.deleted) });
  } catch (error) {
    return storeError(error);
  }
}

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const checked = validateCardDraft(body.draft, memberKeys);
  if (!checked.ok) return bad(checked.error);
  const now = new Date().toISOString();
  const id = newId("card");
  try {
    await putOne<BoardCard>("mp_board", id, {
      id,
      ...checked.value,
      column: isColumn(body.column) ? body.column : "todo",
      createdBy: auth.member.key,
      createdAt: now,
      updatedAt: now,
      doneAt: null
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return storeError(error);
  }
}

export async function PATCH(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const id = docId(body.id);
  if (!id) return bad("ไม่พบงาน");
  const action = text(body.action);

  let draft: ReturnType<typeof validateCardDraft> | null = null;
  if (action === "update") {
    draft = validateCardDraft(body.draft, memberKeys);
    if (!draft.ok) return bad(draft.error);
  } else if (action === "move") {
    if (!isColumn(body.column)) return bad("คอลัมน์ไม่ถูกต้อง");
  } else if (action !== "delete" && action !== "restore") {
    return bad("unknown action");
  }

  try {
    const saved = await updateOne<BoardCard>("mp_board", id, (current) => {
      if (!current) return null;
      const now = new Date().toISOString();
      const next: BoardCard = { ...current, updatedAt: now };
      if (action === "move" && isColumn(body.column)) {
        next.column = body.column;
        next.doneAt = body.column === "done" ? now : null;
      } else if (action === "delete") {
        next.deleted = true;
      } else if (action === "restore") {
        next.deleted = false;
      } else if (draft && draft.ok) {
        Object.assign(next, draft.value);
      }
      return { data: next, result: next };
    });
    if (!saved) return fail(404, "ไม่พบงาน");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeError(error);
  }
}
