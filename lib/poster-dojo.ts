export type Poster = {
  id: string; name: string; status: string; imageUrl: string; refImage: string; refUrl: string; sidebysideUrl: string;
  grade: number | null; verdict: string; fails: string[]; champ_comment: string; reviewed_by: string;
  rework_round: number; updatedAt: number; version: string;
};
export function reviewable(status: string) { return status === 'pending' || status === 'revise'; }
export function sortPosters(posters: Poster[]) {
  return posters.filter(p => p.status !== 'archived').sort((a,b) => Number(reviewable(b.status))-Number(reviewable(a.status)) || b.updatedAt-a.updatedAt);
}
export function reworkTask(name: string, round: number, comment: string) {
  return [
    'Rework practice poster ที่ Champ กดให้แก้ ตาม ~/Projects/poster-dojo/PRACTICE.md (section REWORK).',
    `Poster: ${name}  (ไฟล์เดิม: practice/${name}.html)  ·  รอบแก้ที่ ${round}`,
    `คอมเมนต์ Champ (สิ่งที่ต้องแก้): "${comment}"`,
    'หา HTML source: ถ้ามี practice/<name>.html ใช้เลย; ถ้าไม่มี ลอง ../uplevel-poster-template/samples/<name>.html แล้ว copy เป็น practice/<name>.html ก่อน (ห้ามแก้ sample ต้นฉบับ).',
    'ทำ: อ่าน HTML นั้น + RUBRIC.md + lessons/<name>.json → แก้เฉพาะจุดที่ Champ บอก (อย่ารื้อทั้งใบ ถ้าจุดอื่นดีอยู่แล้ว).',
    'render ด้วยวิธีเดิมของใบนั้น: ถ้า lesson ใช้ printfx → bash ~/Projects/uplevel-poster-template/printfx/printfx.sh practice/<name>.html <preset เดิม> แล้วก๊อปเป็น practice/<name>.png; ไม่งั้น bash render.sh. แล้วทำภาพคู่ใหม่ตาม PRACTICE.md Phase 4 (compare.py, REF ซ้าย/OURS ขวา, Pinterest saves + ลิงก์พิน, บรรทัด ยืม:).',
    'push ทับใบเดิม (FIREBASE_KEY_PATH=~/Projects/up-level-leaderboard/service-account.json node firestore-sync.mjs push practice/<name>.png, ใช้ node LTS) → node firestore-sync.mjs status <name> pending เพื่อกลับมาให้ตรวจรอบใหม่. ทำ autonomous.'
  ].join('\n');
}
