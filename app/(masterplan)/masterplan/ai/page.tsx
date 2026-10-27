import { MpHead } from "../../../../components/masterplan/MpHead.tsx";
import { AiTokens } from "../../../../components/masterplan/AiTokens.tsx";
import { requireMasterplanMember } from "../../../../lib/masterplan-auth.ts";
import { mpStore } from "../../../../lib/masterplan-store.ts";
import { MAX_ACTIVE_TOKENS, listMyTokens } from "../../../../lib/masterplan-tokens.ts";

export const dynamic = "force-dynamic";

export default async function AiAccessPage() {
  const member = await requireMasterplanMember();
  const tokens = await listMyTokens(mpStore, member.key);
  return (
    <>
      <MpHead
        eyebrow="AI ของฉัน"
        title="ต่อ AI ของฉันเข้ากับ Masterplan"
        sub="สร้างกุญแจส่วนตัวให้ AI อ่านแผน ช่วยร่างข้อเสนอ จดกระดาษทด และดูงาน — ในนามของคุณ AI ตัดสินมติหรือแก้ฉบับกลางเองไม่ได้"
      />
      <AiTokens
        memberName={member.name}
        max={MAX_ACTIVE_TOKENS}
        tokens={tokens.map((t) => ({ hash: t.hash, label: t.label, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt, revokedAt: t.revokedAt }))}
      />
    </>
  );
}
