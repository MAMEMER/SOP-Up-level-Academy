// สายพานทำโพส (Poster Dojo Phase 7) — งานโพส 1 ใบ = 1 run เก็บที่ poster-dojo/run-<name> {kind:'run'}.
// Mac mini (dojo-worker.mjs) หยิบ run ที่ status = new / redo / continue / approved ไปให้ Claude ทำ
// แล้ว Claude บันทึกแต่ละขั้นกลับมาด้วย run-stage.mjs. หน้านี้แค่ "ดู + สั่ง" ไม่ได้ทำโพสเอง.

export const RUN_STAGES = [
  { key: 'ref', label: 'หา ref', hint: 'ค้น Pinterest ได้ 12 รูป แล้วเลือก 1 รูปเป็นต้นแบบ' },
  { key: 'copy', label: 'ก็อปให้เหมือน', hint: 'ทำตามต้นแบบให้เหมือนเป๊ะก่อน เพื่อเช็คว่าเข้าใจงานจริง' },
  { key: 'adapt', label: 'เปลี่ยนเป็น Up Level', hint: 'ใส่ข้อมูลจริง โลโก้ QR ของร้านแทนของเดิม' },
  { key: 'review', label: 'Claude ตรวจ', hint: 'เช็ค 8 ข้อ เช่น อ่านออกในมือถือ ข้อมูลตรง QR สแกนได้' },
  { key: 'template', label: 'เก็บเป็นเทมเพลต', hint: 'หลังกดผ่าน จะเข้าไปอยู่ในเครื่องมือทำโพสให้ทุกคนใช้' }
] as const;
export type StageKey = typeof RUN_STAGES[number]['key'];
export const STAGE_KEYS = RUN_STAGES.map(s => s.key) as StageKey[];

export const RUN_JOBS = [
  ['weekly', 'ตารางรายสัปดาห์ (ทุกเกม)'],
  ['lorcana-weekly', 'Lorcana weekly'],
  ['pokemon-weekly', 'Pokémon weekly'],
  ['riftbound-weekly', 'Riftbound weekly'],
  ['pack-rush', 'Pack Rush'],
  ['preorder', 'Preorder'],
  ['other', 'อื่นๆ (เขียนในหมายเหตุ)']
] as const;

export const RUN_STATUS_TH: Record<string, string> = {
  todo: 'ยังไม่ถึง', running: 'กำลังทำ', done: 'เสร็จ', failed: 'มีปัญหา', waiting: 'รอตรวจ',
  stale: 'รอทำใหม่', redo: 'สั่งแก้แล้ว', queued: 'เข้าคิว', new: 'งานใหม่', continue: 'ทำต่อ', approved: 'ผ่านแล้ว'
};

export type RunItem = { img: string; caption: string };
export type RunStage = {
  key: StageKey; label: string; status: string; summary: string; at: number;
  /** % ที่ Claude รายงานระหว่างทำ (0–100) + กำลังทำอะไร */
  progress: number | null; progressNote: string; progressAt: number;
  items: RunItem[]; cands: RunItem[]; picked: number | null;
  metrics: { label: string; value: string }[]; links: { url: string; label: string }[];
};
export type RunLog = { stage: string; note: string; by: string; at: number; pick?: number };
export type Run = {
  id: string; name: string; title: string; status: string; round: number;
  brief: { job: string; query: string; note: string };
  redo: { from: string; note: string; pick?: number; by: string } | null;
  stages: RunStage[]; log: RunLog[]; updatedAt: number; version: string;
  /** สัญญาณชีพจาก mini: state = pending (รอคิว) | running | idle, at = อัปเดตล่าสุด */
  live: { state: string; at: number; started: number | null } | null;
};

/** สถานะ "ยังทำอยู่ไหม" สำหรับคนดู: เงียบเกิน 6 นาทีระหว่างทำ = อาจค้าง */
export const STALL_MS = 6 * 60_000;
export function liveState(run: Pick<Run, 'live' | 'status'>, now: number): 'idle' | 'queued' | 'working' | 'stalled' {
  const busy = ['new', 'redo', 'queued', 'continue', 'running'].includes(run.status) ||
    (run.status === 'approved' && run.live?.state !== 'idle' && !!run.live);
  if (!busy) return 'idle';
  if (!run.live || run.live.state === 'idle' || run.live.state === 'pending') return 'queued';
  return now - run.live.at > STALL_MS ? 'stalled' : 'working';
}

/** งานที่ต้องให้คนดู (รอตรวจ) ขึ้นก่อน แล้วเรียงใหม่สุดก่อน */
export function sortRuns(runs: Run[]) {
  const urgent = (r: Run) => (r.status === 'waiting' ? 1 : 0);
  return [...runs].sort((a, b) => urgent(b) - urgent(a) || b.updatedAt - a.updatedAt);
}

/** Firestore patch เมื่อสั่งแก้ขั้น `stage`: ขั้นนั้น = redo, ขั้นหลังจากนั้น = stale, run = redo */
export function redoPatch(stage: StageKey, existing: StageKey[], note: string, by: string, at: number, pick?: number) {
  const from = STAGE_KEYS.indexOf(stage);
  const patch: Record<string, unknown> = {
    status: 'redo',
    redo: { from: stage, note, by, at, ...(pick != null ? { pick } : {}) }
  };
  // ขั้นที่สั่งแก้: เก็บรูปเดิมไว้ให้ดูระหว่างรอ · ขั้นหลังจากนั้นล้างทิ้งทั้งหมด (ผลเก่าใช้ไม่ได้แล้ว)
  RUN_STAGES.forEach((s, i) => {
    if (i < from || !existing.includes(s.key)) return;
    if (s.key === stage) { patch[`stages.${s.key}.status`] = 'redo'; patch[`stages.${s.key}.progress`] = 0; patch[`stages.${s.key}.progress_note`] = ''; }
    else patch[`stages.${s.key}`] = { order: i + 1, label: s.label, status: 'todo', items: [] };
  });
  return patch;
}

/** ด่านรอคน: ขั้นที่ status=waiting (เช่น copy) ต้องให้คนกด "ไปต่อ" ก่อนระบบจะทำขั้นถัดไป */
export function proceedStage(run: Pick<Run, 'status' | 'stages'>): StageKey | null {
  if (run.status === 'approved' || run.status === 'done') return null;
  const s = run.stages.find(x => x.status === 'waiting' && x.key !== 'review');
  return s ? s.key : null;
}
export function proceedPatch(stage: StageKey) {
  return { status: 'continue', redo: null, [`stages.${stage}.status`]: 'done' };
}

export function canRedo(run: Pick<Run, 'status'>) { return run.status !== 'approved' && run.status !== 'done'; }
export function canApprove(run: Pick<Run, 'status' | 'stages'>) {
  return run.status !== 'approved' && run.status !== 'done' && run.stages.some(s => s.key === 'adapt' && s.status === 'done');
}

/** ชื่องาน = <job>-YYYYMMDD-HHMM ตามเวลาไทย (server บน Vercel เป็น UTC) */
export function runName(job: string, nowMs: number) {
  const t = new Date(nowMs + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${job}-${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}-${p(t.getUTCHours())}${p(t.getUTCMinutes())}`;
}
export function newRunStages() {
  return Object.fromEntries(RUN_STAGES.map((s, i) => [s.key, { order: i + 1, label: s.label, status: 'todo', items: [] }]));
}

export const POSTER_EDITOR_URL = 'https://uplevel-poster-editor.vercel.app/editor';
