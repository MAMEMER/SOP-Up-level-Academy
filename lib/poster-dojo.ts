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
    'ทำ: อ่าน HTML นั้น + RUBRIC.md → แก้เฉพาะจุดที่ Champ บอก/วงไว้ (อย่ารื้อทั้งใบ ถ้าจุดอื่นดีอยู่แล้ว) → bash render.sh practice/<name>.html practice/<name>.png → self-review เทียบ RUBRIC → push ทับใบเดิม (FIREBASE_KEY_PATH=~/Projects/up-level-leaderboard/service-account.json node firestore-sync.mjs push practice/<name>.png, ใช้ node LTS) → จากนั้น node firestore-sync.mjs status <name> pending เพื่อให้กลับมาให้ Champ ตรวจรอบใหม่. ทำ autonomous.'
  ].join('\n');
}
