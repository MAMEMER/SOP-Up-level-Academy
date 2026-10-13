// บรีฟคลิป: ก่อน Mac mini ตัดคลิปจากโฟลเดอร์ Drive `Footage/<หัวข้อ>/` คนที่อัปฟุตเทจต้องบอกก่อน
// ว่าคลิปนี้เอาไปทำอะไร ฮุกอยู่ตรงไหน ของเด็ดคืออะไร — AI จะได้ไม่ต้องเดา.
// ไฟล์นี้เป็น logic ล้วน (ไม่แตะ Firestore) เพื่อให้ test ได้ด้วย node --test.

export const CLIP_BRIEFS_COLLECTION = "clip_briefs";
export const AUTOCUT_PENDING_COLLECTION = "autocut_pending";
export const AUTOCUT_PENDING_DOC = "current";
export const DEFAULT_SINCE_DAYS = 14;

export const CLIP_GOALS = {
  pack_opening: "เปิดซอง/โชว์การ์ด",
  match_highlight: "แข่ง/ไฮไลต์เกม",
  store_vibe: "บรรยากาศร้าน/อีเวนต์",
  review_tutorial: "รีวิว/สอน",
  product_ad: "โฆษณาสินค้า",
  other: "อื่นๆ"
} as const;
export type ClipGoal = keyof typeof CLIP_GOALS;

export const MUSIC_MOODS = {
  hype: "มันส์/เร้าใจ",
  chill: "ชิล",
  funny: "ตลก",
  suspense: "ลุ้นระทึก",
  ai_pick: "ให้ AI เลือก"
} as const;
export type MusicMood = keyof typeof MUSIC_MOODS;

export const LIMITS = { folder: 200, short: 300, long: 2000 } as const;

export type ClipBriefInput = {
  folder: string;
  goal: ClipGoal;
  goalNote: string;
  hook: string;
  highlights: string;
  mustAvoid: string;
  textIdeas: string;
  musicMood: MusicMood;
};

export type ClipBrief = ClipBriefInput & {
  id: string;
  folderKey: string;
  goalLabel: string;
  musicMoodLabel: string;
  submittedBy: { id: string; name: string; email: string };
  createdAt: string;
  usedByJob: unknown;
  usedAt?: string;
};

export type PendingFolder = { folder: string; folderKey: string; files: number | string[]; firstSeen: string };

/** ชื่อโฟลเดอร์ → key ไว้จับคู่: NFC, ตัวเล็ก, ตัดช่องว่าง/เครื่องหมายทิ้ง (เหลือตัวอักษร+ตัวเลข+สระ/วรรณยุกต์ไทย) */
export function normalizeFolderKey(folder: string): string {
  return String(folder ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
}

const str = (value: unknown) => (typeof value === "string" ? value.normalize("NFC").trim() : "");

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** ตรวจฟอร์มจากพนักงาน — error เป็นข้อความไทยที่โชว์ให้น้องเห็นได้เลย */
export function validateClipBrief(body: unknown): ValidationResult<ClipBriefInput> {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const folder = str(raw.folder);
  if (!folder) return { ok: false, error: "ใส่ชื่อโฟลเดอร์ใน Drive ก่อน" };
  if (folder.length > LIMITS.folder || /[\\/]/.test(folder)) return { ok: false, error: "ชื่อโฟลเดอร์ไม่ถูกต้อง (ใส่แค่ชื่อโฟลเดอร์ ไม่ต้องมี /)" };
  if (!normalizeFolderKey(folder)) return { ok: false, error: "ชื่อโฟลเดอร์ต้องมีตัวอักษรหรือตัวเลข" };

  const goal = str(raw.goal);
  if (!(goal in CLIP_GOALS)) return { ok: false, error: "เลือกว่าคลิปนี้เอาไปทำอะไร" };
  const goalNote = str(raw.goalNote);
  if (goal === "other" && !goalNote) return { ok: false, error: "เลือก 'อื่นๆ' แล้ว ช่วยพิมพ์ว่าอยากได้แนวไหน" };

  const hook = str(raw.hook);
  if (!hook) return { ok: false, error: "ใส่ฮุกเปิดคลิป (อะไร + ประมาณวินาทีไหน/ไฟล์ไหน)" };

  const musicMood = str(raw.musicMood) || "ai_pick";
  if (!(musicMood in MUSIC_MOODS)) return { ok: false, error: "เลือกอารมณ์เพลง" };

  const value: ClipBriefInput = {
    folder,
    goal: goal as ClipGoal,
    goalNote,
    hook,
    highlights: str(raw.highlights),
    mustAvoid: str(raw.mustAvoid),
    textIdeas: str(raw.textIdeas),
    musicMood: musicMood as MusicMood
  };
  if (value.goalNote.length > LIMITS.short) return { ok: false, error: "รายละเอียดแนวคลิปยาวเกินไป" };
  for (const key of ["hook", "highlights", "mustAvoid", "textIdeas"] as const) {
    if (value[key].length > LIMITS.long) return { ok: false, error: "ข้อความยาวเกินไป (ไม่เกิน 2,000 ตัวอักษรต่อช่อง)" };
  }
  return { ok: true, value };
}

/** ประกอบ doc ที่จะเขียนลง clip_briefs (ตัวตนผู้ส่งมาจาก session เท่านั้น) */
export function buildClipBriefDoc(
  input: ClipBriefInput,
  submittedBy: ClipBrief["submittedBy"],
  createdAt: string
): Omit<ClipBrief, "id"> {
  return {
    ...input,
    folderKey: normalizeFolderKey(input.folder),
    goalLabel: CLIP_GOALS[input.goal],
    musicMoodLabel: MUSIC_MOODS[input.musicMood],
    submittedBy,
    createdAt,
    usedByJob: null
  };
}

/** ?since= → ISO; ว่าง = ย้อนหลัง 14 วัน; ผิดรูป = null (ตอบ 400) */
export function resolveSince(raw: string | null | undefined, now: Date = new Date()): string | null {
  if (!raw) return new Date(now.getTime() - DEFAULT_SINCE_DAYS * 86_400_000).toISOString();
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** body ของ POST /api/clip-briefs/pending จาก Mac mini */
export function validatePendingFolders(body: unknown): ValidationResult<PendingFolder[]> {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).folders : undefined;
  if (!Array.isArray(raw)) return { ok: false, error: "folders_must_be_array" };
  if (raw.length > 500) return { ok: false, error: "too_many_folders" };
  const out: PendingFolder[] = [];
  for (const entry of raw) {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const folder = str(item.folder);
    if (!folder || folder.length > LIMITS.folder) return { ok: false, error: "invalid_folder" };
    let files: number | string[];
    if (typeof item.files === "number" && Number.isFinite(item.files) && item.files >= 0) files = Math.floor(item.files);
    else if (Array.isArray(item.files)) files = item.files.filter((f): f is string => typeof f === "string").slice(0, 500).map((f) => f.slice(0, 300));
    else if (item.files === undefined || item.files === null) files = 0;
    else return { ok: false, error: "invalid_files" };
    // firstSeen: ISO string หรือ epoch ms ก็ได้ — อ่านไม่ออกก็เก็บว่าง
    const seen = item.firstSeen;
    const seenTime = typeof seen === "number" ? seen : typeof seen === "string" ? Date.parse(seen) : NaN;
    const firstSeen = Number.isFinite(seenTime) ? new Date(seenTime).toISOString() : "";
    out.push({ folder, folderKey: normalizeFolderKey(folder), files, firstSeen });
  }
  return { ok: true, value: out };
}

/** body ของ POST /api/clip-briefs/used */
export function validateUsed(body: unknown): ValidationResult<{ id: string; job: unknown }> {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const id = str(raw.id);
  if (!id || id.includes("/") || id.length > 200) return { ok: false, error: "invalid_id" };
  const job = raw.job;
  if (typeof job === "string") {
    const trimmed = job.trim();
    if (!trimmed || trimmed.length > 500) return { ok: false, error: "invalid_job" };
    return { ok: true, value: { id, job: trimmed } };
  }
  if (job && typeof job === "object" && !Array.isArray(job)) {
    const serialized = JSON.stringify(job);
    if (serialized.length > 5000) return { ok: false, error: "job_too_large" };
    return { ok: true, value: { id, job: JSON.parse(serialized) } };
  }
  return { ok: false, error: "invalid_job" };
}

/** โฟลเดอร์ที่รอตัด + ป้ายว่ามีบรีฟแล้วหรือยัง (ยังไม่มีบรีฟขึ้นก่อน แล้วเรียงเก่า→ใหม่) */
export function markPendingWithBriefs(folders: PendingFolder[], briefFolderKeys: Iterable<string>) {
  const keys = new Set(briefFolderKeys);
  return folders
    .map((folder) => ({ ...folder, folderKey: folder.folderKey || normalizeFolderKey(folder.folder), hasBrief: keys.has(folder.folderKey || normalizeFolderKey(folder.folder)) }))
    .sort((a, b) => Number(a.hasBrief) - Number(b.hasBrief) || a.firstSeen.localeCompare(b.firstSeen));
}

export function fileCount(files: number | string[]): number {
  return Array.isArray(files) ? files.length : files;
}
