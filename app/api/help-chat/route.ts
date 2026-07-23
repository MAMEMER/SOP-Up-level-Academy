// Help chatbot for the SOP site — answers "อะไรคืออะไร / กดตรงไหน".
// Uses Claude when ANTHROPIC_API_KEY is set; otherwise falls back to a built-in
// keyword-matched site guide so the widget is useful out of the box.

const SITE_GUIDE = `เว็บ SOP Up Level — คู่มืองาน + KPI พนักงาน Up Level Academy. หน้าและปุ่มหลัก:
- หน้าหลัก (เมนู "หน้าหลัก") — ภาพรวมงานวันนี้: สถานะ checklist (เปิดร้าน/stock/จัดส่ง/ปิดร้าน) + งาน daily/weekly/monthly.
- เช็คลิสต์ (เมนู "เช็คลิสต์") — ติ๊กงานทีละข้อ: งานเปิดร้าน, งาน stock (นับ+เติม), งานจัดส่ง, งานปิดร้าน. ติ๊กแล้วบันทึกอัตโนมัติ.
- คู่มืองาน (เมนู "คู่มืองาน") — ขั้นตอนการทำงานแต่ละอย่าง + รูปตัวอย่าง.
- คะแนนพนักงาน (เมนู "คะแนนพนักงาน", แอดมิน) — KPI 5 หมวด (เข้างาน/stock/checklist/บริการลูกค้า/งานมอบหมาย) เต็ม 100, incentive, หักเงินถ้าต่ำกว่า 50. เลือกช่วงเวลา + บันทึกเหตุการณ์ complaint/งานมอบหมาย + อัปโหลด CSV จาก StoreHub.
- สรุปเจ้าของร้าน (แอดมิน) — ยอดขาย + stock ภาพรวม.
- ตรวจงาน (แอดมิน) — อนุมัติ/ตรวจงานที่พนักงานส่ง.
- สรุปรายเดือน (แอดมิน) — สรุปผลรายเดือน.
- ปุ่มแจ้งบัค/แนะนำ = ปุ่มกลมส้มมุมล่างขวา (ไอคอนแมลง) กดแล้วพิมพ์แจ้งได้เลย ไม่ต้อง login.
- ออกจากระบบ = ปุ่มส้มมุมขวาบน.`;

function fallbackAnswer(q: string): string {
  const s = q.toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));
  if (has("บัค", "แจ้ง", "ปัญหา", "report", "bug")) return "กดปุ่มกลมส้มมุมล่างขวา (ไอคอนแมลง 🐛) → เลือก บัค หรือ แนะนำ → พิมพ์หัวข้อ → ส่ง. ไม่ต้อง login ทีมงานเห็นทันที.";
  if (has("checklist", "เช็คลิสต์", "ติ๊ก", "งานวันนี้")) return "ไปเมนู \"เช็คลิสต์\" ด้านบน → มีงานเปิดร้าน/stock/จัดส่ง/ปิดร้าน ติ๊กทีละข้อ ระบบบันทึกให้อัตโนมัติ.";
  if (has("คะแนน", "kpi", "incentive", "หักเงิน", "เงินเดือน")) return "เมนู \"คะแนนพนักงาน\" (แอดมิน) — ดู KPI 5 หมวดเต็ม 100, incentive, และหักเงินถ้าต่ำกว่า 50. บันทึก complaint/งานมอบหมาย + อัปโหลด CSV StoreHub ได้ในหน้านี้.";
  if (has("stock", "สต๊อก", "นับ", "เติม")) return "งาน stock อยู่ในเมนู \"เช็คลิสต์\" (นับ+เติม). ข้อมูล stock ภาพรวมดูที่ \"สรุปเจ้าของร้าน\".";
  if (has("คู่มือ", "ขั้นตอน", "ทำยังไง", "วิธี")) return "เมนู \"คู่มืองาน\" — มีขั้นตอนการทำงานแต่ละอย่างพร้อมรูปตัวอย่าง.";
  if (has("ออก", "logout", "ล็อกเอาท์")) return "ปุ่ม \"ออกจากระบบ\" ส้มๆ มุมขวาบน.";
  if (has("กะ", "ตาราง", "schedule", "เข้างาน")) return "ตารางกะจัดใน Google Sheet (tab วางแผน) → ระบบคิดคะแนนเข้างานจากกะจริง vs เวลาเข้าออก StoreHub.";
  return "ลองถามเจาะจง เช่น \"ติ๊ก checklist ยังไง\", \"ดูคะแนนตรงไหน\", \"แจ้งบัคยังไง\". เมนูหลัก: หน้าหลัก · เช็คลิสต์ · คู่มืองาน · คะแนนพนักงาน (แอดมิน).";
}

export async function POST(req: Request) {
  let body: { messages?: Array<{ role: string; content: string }> } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ reply: fallbackAnswer(lastUser), source: "guide" });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: `คุณคือผู้ช่วยแนะนำการใช้งานเว็บ SOP Up Level สำหรับพนักงานหน้าร้าน. ตอบสั้น กระชับ เป็นภาษาไทย บอกชัดว่าไปเมนูไหน/กดปุ่มไหน. ห้ามเดาข้อมูลนอกเว็บ. ข้อมูลเว็บ:\n${SITE_GUIDE}`,
        messages: messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content }))
      })
    });
    const data = await res.json();
    const reply = data?.content?.[0]?.text || fallbackAnswer(lastUser);
    return Response.json({ reply, source: "ai" });
  } catch {
    return Response.json({ reply: fallbackAnswer(lastUser), source: "guide" });
  }
}
