import { NextResponse } from "next/server";
import { masterplanApiMember } from "../../../../../lib/masterplan-auth.ts";
import { bad, docId, fail, readBody, storeError, text } from "../../../../../lib/masterplan-api.ts";
import { getOne, listAll, newId, putOne } from "../../../../../lib/masterplan-store.ts";
import type { BoardCard, BoardPing } from "../../../../../lib/team-board.ts";

// POST { id, message } → queue a LINE nudge from GB to the card's owner. The line-ops bot on
// the shop's machine polls mp_board_pings (sentAt null), sends, then stamps sentAt.
// One ping per card per 10 minutes so a double tap never sends twice.

export const dynamic = "force-dynamic";
const COOLDOWN_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const auth = await masterplanApiMember();
  if (auth.error) return auth.error;
  const body = await readBody(request);
  const id = docId(body.id);
  if (!id) return bad("ไม่พบงาน");
  const message = text(body.message).trim().slice(0, 300);
  try {
    const card = await getOne<BoardCard>("mp_board", id);
    if (!card || card.deleted) return fail(404, "ไม่พบงาน");
    if (!card.owner) return bad("งานนี้ยังไม่มีคนรับ เลือกคนทำก่อนถึงจะเตือนได้");
    if (card.owner === auth.member.key) return bad("งานนี้เป็นของคุณเอง");
    const recent = (await listAll<BoardPing>("mp_board_pings")).filter(
      (p) => p.cardId === id && Date.now() - Date.parse(p.createdAt) < COOLDOWN_MS
    );
    if (recent.length) return fail(429, "เพิ่งเตือนงานนี้ไป รอ 10 นาทีค่อยเตือนอีกครั้ง");
    const pingId = newId("ping");
    const now = new Date().toISOString();
    await putOne<BoardPing>("mp_board_pings", pingId, {
      id: pingId,
      cardId: id,
      title: card.title,
      due: card.due,
      to: card.owner,
      from: auth.member.key,
      message,
      createdAt: now,
      sentAt: null
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeError(error);
  }
}
