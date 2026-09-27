"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CircleCheck,
  CircleHelp,
  FileText,
  House,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Send,
  TriangleAlert,
  Trash2
} from "lucide-react";
import {
  BANK_OPTIONS,
  BODY_OPTIONS,
  EMPLOYMENT_OPTIONS,
  FILE_LABELS,
  HOSPITAL_CHOICE_OPTIONS,
  MARITAL_OPTIONS,
  MAX_OTHER_FILES,
  MULTI_EMPLOYER_OPTIONS,
  PERSON_TYPE_OPTIONS,
  PRIOR_INSURED_OPTIONS,
  STAFF_STATUS_LABEL,
  TITLE_OPTIONS,
  childCount,
  filesSatisfied,
  mergeDraft,
  needsHospitalRanking,
  validateStaffDocForm,
  type DocsStatus,
  type FileKind,
  type FormKey,
  type StaffDocForm,
  type ValidationIssue
} from "../lib/staff-documents.ts";
import { prepareDocFile, thumbnailFor, uploadDocFile } from "../lib/staff-doc-files-client.ts";

type UploadedFile = {
  id: string;
  kind: FileKind;
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
  thumb: string;
};

type Draft = { form: StaffDocForm; files: UploadedFile[]; savedAt: string; editing: boolean };

type Props = {
  employeeId: string;
  nickname: string;
  today: string;
  deadlineText: string;
  prefill: StaffDocForm;
  initialStatus: DocsStatus;
  initialSubmittedAt: string | null;
  initialSubmitCount: number;
  filesOnDrive: FileKind[];
  pendingFiles: FileKind[];
  readOnly: boolean;
};

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function draftKey(employeeId: string) {
  return `sop-staff-docs:v1:${employeeId}`;
}

function readDraft(employeeId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(employeeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || typeof parsed !== "object" || !parsed.form) return null;
    return {
      form: parsed.form as StaffDocForm,
      files: Array.isArray(parsed.files) ? (parsed.files as UploadedFile[]).filter((file) => file && file.path && file.kind) : [],
      savedAt: String(parsed.savedAt || ""),
      editing: Boolean(parsed.editing)
    };
  } catch {
    return null;
  }
}

function writeDraft(employeeId: string, draft: Draft) {
  try {
    window.localStorage.setItem(draftKey(employeeId), JSON.stringify(draft));
  } catch {
    // quota / private mode — ฟอร์มยังใช้ได้ แค่ไม่ได้จำ
  }
}

function clearDraft(employeeId: string) {
  try {
    window.localStorage.removeItem(draftKey(employeeId));
  } catch {
    // ignore
  }
}

function formatThaiDateTime(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// ---------------------------------------------------------------- ช่องกรอกย่อย

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`sdoc-field${error ? " has-error" : ""}`} id={`field-${id}`}>
      <label className="sdoc-label" htmlFor={id}>
        {label}
        {required ? <span className="sdoc-req"> *</span> : <span className="sdoc-opt"> (ถ้ามี)</span>}
      </label>
      {children}
      {error ? <p className="sdoc-error">{error}</p> : hint ? <p className="sdoc-hint">{hint}</p> : null}
    </div>
  );
}

function Choice({
  id,
  options,
  value,
  onChange,
  disabled
}: {
  id: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="sdoc-choices" role="radiogroup" id={id}>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          role="radio"
          aria-checked={value === option}
          className={`sdoc-choice${value === option ? " is-on" : ""}`}
          onClick={() => onChange(option)}
          disabled={disabled}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function ThaiDateInput({
  id,
  value,
  onChange,
  disabled,
  fromYear,
  toYear
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  fromYear: number;
  toYear: number;
}) {
  const [y, m, d] = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-") : ["", "", ""];
  const [parts, setParts] = useState({ y, m, d });
  useEffect(() => setParts({ y, m, d }), [y, m, d]);

  const update = (next: { y: string; m: string; d: string }) => {
    setParts(next);
    if (next.y && next.m && next.d) onChange(`${next.y}-${next.m}-${next.d}`);
    else onChange("");
  };
  const years: number[] = [];
  for (let year = toYear; year >= fromYear; year -= 1) years.push(year);

  return (
    <div className="sdoc-date" id={id}>
      <select aria-label="วัน" value={parts.d} onChange={(event) => update({ ...parts, d: event.target.value })} disabled={disabled}>
        <option value="">วัน</option>
        {Array.from({ length: 31 }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => (
          <option key={day} value={day}>
            {Number(day)}
          </option>
        ))}
      </select>
      <select aria-label="เดือน" value={parts.m} onChange={(event) => update({ ...parts, m: event.target.value })} disabled={disabled}>
        <option value="">เดือน</option>
        {MONTHS.map((label, index) => (
          <option key={label} value={String(index + 1).padStart(2, "0")}>
            {label}
          </option>
        ))}
      </select>
      <select aria-label="ปี พ.ศ." value={parts.y} onChange={(event) => update({ ...parts, y: event.target.value })} disabled={disabled}>
        <option value="">ปี พ.ศ.</option>
        {years.map((year) => (
          <option key={year} value={String(year)}>
            {year + 543}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------- ฟอร์มหลัก

export function StaffDocumentsForm(props: Props) {
  const { employeeId, today, readOnly } = props;
  const [form, setForm] = useState<StaffDocForm>(props.prefill);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [status, setStatus] = useState<DocsStatus>(props.initialStatus);
  const [submittedAt, setSubmittedAt] = useState<string | null>(props.initialSubmittedAt);
  const [submitCount, setSubmitCount] = useState(props.initialSubmitCount);
  const [filesOnDrive, setFilesOnDrive] = useState<FileKind[]>(Array.from(new Set([...props.filesOnDrive, ...props.pendingFiles])));
  const [editing, setEditing] = useState(props.initialStatus === "not_submitted");
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busyKind, setBusyKind] = useState<FileKind | null>(null);
  const [fileError, setFileError] = useState<Partial<Record<FileKind, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [loadingPrevious, setLoadingPrevious] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // โหลด draft ที่ค้างในเครื่อง (ปิดหน้าไปแล้วกลับมาต้องไม่หาย)
  useEffect(() => {
    const draft = readDraft(employeeId);
    if (draft) {
      setForm(mergeDraft(props.prefill, draft.form));
      setFiles(draft.files);
      setSavedAt(draft.savedAt);
      if (draft.editing) setEditing(true);
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  // บันทึกอัตโนมัติทุกครั้งที่แก้ (หน่วงนิดเดียว ไม่เขียนทุกตัวอักษร)
  useEffect(() => {
    if (!loaded || !editing || readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const now = new Date().toISOString();
      writeDraft(employeeId, { form, files, savedAt: now, editing: true });
      setSavedAt(now);
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [form, files, loaded, editing, readOnly, employeeId]);

  const set = useCallback((key: FormKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);
  const touch = (key: string) => setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const uploadedKinds = useMemo(() => {
    const map: Partial<Record<FileKind, boolean>> = {};
    for (const file of files) map[file.kind] = true;
    return map;
  }, [files]);

  const issues = useMemo(
    () => validateStaffDocForm(form, { today, files: filesSatisfied(uploadedKinds, filesOnDrive), employeeId }),
    [form, today, uploadedKinds, filesOnDrive, employeeId]
  );
  const issueFor = (key: FormKey | FileKind): string | undefined => {
    const issue = issues.find((item) => item.key === key);
    if (!issue) return undefined;
    // "ยังไม่ได้กรอก" โชว์หลังแตะช่องแล้ว — ไม่ให้ทั้งหน้าแดงตั้งแต่เปิด; รูปแบบผิดโชว์ทันทีที่มีค่า
    if (issue.message === "ยังไม่ได้กรอก" || issue.message === "ยังไม่ได้แนบ") return touched.has(key) ? issue.message : undefined;
    return issue.message;
  };

  const inputProps = (key: FormKey, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => ({
    id: key,
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
    onBlur: () => touch(key),
    disabled: readOnly,
    "aria-invalid": Boolean(issueFor(key)),
    ...extra
  });

  const choose = (key: FormKey) => (value: string) => {
    set(key, value);
    touch(key);
  };

  async function onPickFile(kind: FileKind, list: FileList | null) {
    const original = list?.[0];
    if (!original) return;
    setBusyKind(kind);
    setFileError((prev) => ({ ...prev, [kind]: undefined }));
    touch(kind);
    try {
      const prepared = await prepareDocFile(original);
      const [uploaded, thumb] = await Promise.all([uploadDocFile(prepared.file, kind), thumbnailFor(prepared.file)]);
      const entry: UploadedFile = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind,
        path: uploaded.path,
        originalName: original.name.slice(0, 120),
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        thumb
      };
      setFiles((prev) => (kind === "other" ? [...prev, entry] : [...prev.filter((file) => file.kind !== kind), entry]));
    } catch (error) {
      setFileError((prev) => ({ ...prev, [kind]: error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ" }));
    } finally {
      setBusyKind(null);
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  }

  function scrollToIssue(issue: ValidationIssue) {
    touch(issue.key);
    const el = document.getElementById(`field-${issue.key}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = el?.querySelector<HTMLElement>("input, select, textarea, button");
    focusable?.focus({ preventScroll: true });
  }

  function resetAll() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    clearDraft(employeeId);
    setForm(props.prefill);
    setFiles([]);
    setTouched(new Set());
    setSavedAt("");
    setConfirmReset(false);
  }

  async function startEditing() {
    setEditing(true);
    setJustSubmitted(false);
    if (readDraft(employeeId)) return; // มี draft ในเครื่องแล้ว ใช้อันนั้น
    setLoadingPrevious(true);
    try {
      const res = await fetch("/api/staff-documents?previous=1", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { previous?: StaffDocForm | null } | null;
      if (data?.previous) setForm(mergeDraft(props.prefill, data.previous));
    } catch {
      // เปิดฟอร์มว่างที่เติมค่าเริ่มต้นไว้แทน
    } finally {
      setLoadingPrevious(false);
    }
  }

  async function submit() {
    if (issues.length || submitting || readOnly) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/staff-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          files: files.map((file) => ({
            kind: file.kind,
            path: file.path,
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size
          }))
        })
      });
      if (res.redirected || res.status === 401) throw new Error("เซสชันหมดอายุ — เข้าสู่ระบบใหม่ ข้อมูลที่กรอกยังอยู่ครบ");
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        status?: DocsStatus;
        submittedAt?: string;
        submitCount?: number;
        error?: string;
        issues?: ValidationIssue[];
      } | null;
      if (!res.ok || !data?.ok) {
        if (data?.error === "validation" && data.issues?.length) {
          throw new Error(`ยังส่งไม่ได้: ${data.issues.map((issue) => `${issue.label} (${issue.message})`).join(", ")}`);
        }
        if (data?.error === "file_missing_reupload") throw new Error("ไฟล์ที่แนบไว้หายจากระบบ — แนบใหม่อีกครั้ง");
        throw new Error("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง — ข้อมูลที่กรอกยังอยู่ครบ");
      }
      clearDraft(employeeId);
      setStatus(data.status || "pending_drive");
      setSubmittedAt(data.submittedAt || new Date().toISOString());
      setSubmitCount(data.submitCount || submitCount + 1);
      setFilesOnDrive((prev) => Array.from(new Set([...prev, ...files.map((file) => file.kind)])));
      setFiles([]);
      setTouched(new Set());
      setEditing(false);
      setJustSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "ส่งไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------- หน้าสรุปหลังส่ง

  if (!editing) {
    return (
      <section className="sdoc-done" aria-live="polite">
        <CircleCheck className="sdoc-done-icon" aria-hidden />
        <div>
          <p className="eyebrow">{justSubmitted ? "ส่งเรียบร้อย" : "สถานะเอกสาร"}</p>
          <h3>{justSubmitted ? "ได้รับเอกสารแล้ว ขอบคุณครับ" : "คุณส่งเอกสารแล้ว"}</h3>
          <p className="sdoc-done-meta">
            ส่งล่าสุด {formatThaiDateTime(submittedAt)}
            {submitCount > 1 ? ` · ส่งทั้งหมด ${submitCount} ครั้ง` : ""}
          </p>
          <p className="sdoc-done-meta">สถานะ: {STAFF_STATUS_LABEL[status]}</p>
          <p className="sdoc-hint">ถ้าข้อมูลเปลี่ยน (ย้ายบ้าน เปลี่ยนบัญชี) หรือกรอกผิด กดแก้ไขแล้วส่งใหม่ได้ตลอด ของเดิมถูกเก็บเป็นประวัติ</p>
          <div className="sdoc-actions">
            <button type="button" className="sdoc-btn-soft" onClick={startEditing} disabled={readOnly}>
              <Pencil size={18} aria-hidden /> แก้ไข / ส่งใหม่
            </button>
            <Link href="/" className="sdoc-btn-soft">
              <House size={18} aria-hidden /> กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ---------------------------------------------------------------- ฟอร์ม

  const kids = childCount(form);
  const ranking = needsHospitalRanking(form);
  const thisYear = Number(today.slice(0, 4));

  const fileBlock = (kind: FileKind, required: boolean) => {
    const mine = files.filter((file) => file.kind === kind);
    const existing = filesOnDrive.includes(kind) && mine.length === 0;
    const canAddMore = kind === "other" ? mine.length < MAX_OTHER_FILES : mine.length === 0;
    return (
      <FieldShell
        id={kind}
        label={FILE_LABELS[kind]}
        required={required}
        error={fileError[kind] || issueFor(kind)}
        hint={
          existing
            ? "มีไฟล์ที่ส่งไว้แล้ว — แนบใหม่เฉพาะถ้าต้องการเปลี่ยน"
            : mine.length
              ? undefined
              : "ถ่ายรูปให้เห็นตัวหนังสือชัด ไม่มีแสงสะท้อน · รูปหรือ PDF ไม่เกิน 4MB"
        }
      >
        {mine.length ? (
          <ul className="sdoc-files">
            {mine.map((file) => (
              <li key={file.id} className="sdoc-file">
                {file.thumb ? <img src={file.thumb} alt="" className="sdoc-thumb" /> : <FileText className="sdoc-thumb-icon" aria-hidden />}
                <span className="sdoc-file-name">{file.originalName || "ไฟล์แนบ"}</span>
                <button type="button" className="sdoc-icon-btn" onClick={() => removeFile(file.id)} disabled={readOnly} aria-label="ลบไฟล์นี้">
                  <Trash2 size={18} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {canAddMore ? (
          <label className={`sdoc-upload${busyKind === kind ? " is-busy" : ""}${readOnly ? " is-disabled" : ""}`}>
            <input
              type="file"
              accept="image/*,.heic,.heif,application/pdf"
              disabled={readOnly || busyKind !== null}
              onChange={(event) => {
                void onPickFile(kind, event.target.files);
                event.target.value = "";
              }}
            />
            {busyKind === kind ? <LoaderCircle className="sdoc-spin" size={20} aria-hidden /> : <Camera size={20} aria-hidden />}
            <span>{busyKind === kind ? "กำลังอัปโหลด…" : mine.length || existing ? "แนบไฟล์ใหม่" : "ถ่ายรูป / เลือกไฟล์"}</span>
          </label>
        ) : null}
      </FieldShell>
    );
  };

  return (
    <div className="sdoc-form">
      <div className="sdoc-toolbar">
        <span className="sdoc-saved">{readOnly ? "ดูอย่างเดียว" : savedAt ? `บันทึกในเครื่องแล้ว ${formatThaiDateTime(savedAt)}` : "บันทึกอัตโนมัติ ปิดหน้าไปก็ไม่หาย"}</span>
        <button type="button" className="sdoc-icon-btn" onClick={() => setShowHelp((value) => !value)} aria-expanded={showHelp} aria-label="วิธีกรอก">
          <CircleHelp size={20} aria-hidden />
        </button>
      </div>
      {showHelp ? (
        <div className="sdoc-help">
          <p>ข้อมูลนี้ใช้ขึ้นทะเบียนประกันสังคม (สปส.1-03) และโอนเงินเดือน — กรอกให้ตรงกับบัตรประชาชนและสมุดบัญชี</p>
          <p>ช่องที่มี * ต้องกรอก · กรอกค้างไว้ได้ ระบบจำไว้ในเครื่องนี้ · ข้อมูลส่งตรงเข้าไดรฟ์ของเจ้าของร้าน ไม่มีใครในร้านเห็น</p>
          <p>ติดตรงไหน กดปุ่มแจ้งปัญหามุมขวาล่าง แนบรูปหน้าจอได้เลย</p>
        </div>
      ) : null}
      {loadingPrevious ? <p className="sdoc-hint">กำลังโหลดข้อมูลที่เคยส่ง…</p> : null}

      <section className="sdoc-section">
        <p className="eyebrow">1 · ข้อมูลตามบัตรประชาชน</p>
        <FieldShell id="title" label="คำนำหน้า" required error={issueFor("title")}>
          <Choice id="title" options={TITLE_OPTIONS} value={form.title} onChange={choose("title")} disabled={readOnly} />
        </FieldShell>
        <div className="sdoc-grid">
          <FieldShell id="firstNameTh" label="ชื่อ (ไทย)" required error={issueFor("firstNameTh")}>
            <input {...inputProps("firstNameTh", { autoComplete: "given-name" })} />
          </FieldShell>
          <FieldShell id="lastNameTh" label="นามสกุล (ไทย)" required error={issueFor("lastNameTh")}>
            <input {...inputProps("lastNameTh", { autoComplete: "family-name" })} />
          </FieldShell>
          <FieldShell id="firstNameEn" label="ชื่อ (อังกฤษ)" required error={issueFor("firstNameEn")} hint="ตามหลังบัตรประชาชน">
            <input {...inputProps("firstNameEn", { autoCapitalize: "words", lang: "en" })} />
          </FieldShell>
          <FieldShell id="lastNameEn" label="นามสกุล (อังกฤษ)" required error={issueFor("lastNameEn")}>
            <input {...inputProps("lastNameEn", { autoCapitalize: "words", lang: "en" })} />
          </FieldShell>
        </div>
        <FieldShell id="nationalId" label="เลขบัตรประชาชน" required error={issueFor("nationalId")} hint="13 หลัก · ใช้เป็นเลขประกันสังคมด้วย">
          <input {...inputProps("nationalId", { inputMode: "numeric", autoComplete: "off", maxLength: 17 })} />
        </FieldShell>
        <FieldShell id="birthDate" label="วันเดือนปีเกิด" required error={issueFor("birthDate")}>
          <ThaiDateInput id="birthDate" value={form.birthDate} onChange={(value) => { set("birthDate", value); touch("birthDate"); }} disabled={readOnly} fromYear={thisYear - 80} toYear={thisYear - 15} />
        </FieldShell>
        <div className="sdoc-grid">
          <FieldShell id="personType" label="ประเภทบุคคล" required error={issueFor("personType")}>
            <Choice id="personType" options={PERSON_TYPE_OPTIONS} value={form.personType} onChange={choose("personType")} disabled={readOnly} />
          </FieldShell>
          <FieldShell id="nationality" label="สัญชาติ" required error={issueFor("nationality")}>
            <input {...inputProps("nationality")} />
          </FieldShell>
        </div>
        <FieldShell id="address" label="ที่อยู่ตามบัตรประชาชน" required error={issueFor("address")} hint="บ้านเลขที่ หมู่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์">
          <textarea
            id="address"
            rows={3}
            value={form.address}
            onChange={(event) => set("address", event.target.value)}
            onBlur={() => touch("address")}
            disabled={readOnly}
            aria-invalid={Boolean(issueFor("address"))}
          />
        </FieldShell>
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">2 · ติดต่อ และการทำงาน</p>
        <div className="sdoc-grid">
          <FieldShell id="phone" label="เบอร์โทรศัพท์" required error={issueFor("phone")}>
            <input {...inputProps("phone", { inputMode: "tel", type: "tel", autoComplete: "tel" })} />
          </FieldShell>
          <FieldShell id="email" label="อีเมล" error={issueFor("email")}>
            <input {...inputProps("email", { type: "email", inputMode: "email", autoComplete: "email" })} />
          </FieldShell>
        </div>
        <FieldShell id="startDate" label="วันที่เริ่มงาน" required error={issueFor("startDate")} hint="จำไม่ได้แน่ใส่วันที่ใกล้เคียงที่สุด แล้วเขียนไว้ในหมายเหตุ">
          <ThaiDateInput id="startDate" value={form.startDate} onChange={(value) => { set("startDate", value); touch("startDate"); }} disabled={readOnly} fromYear={2020} toYear={thisYear} />
        </FieldShell>
        <FieldShell id="employmentKind" label="ประเภทการจ้าง" required error={issueFor("employmentKind")} hint="ระบบเติมให้จากข้อมูลในร้าน ตรวจว่าถูกต้อง">
          <Choice id="employmentKind" options={EMPLOYMENT_OPTIONS} value={form.employmentKind} onChange={choose("employmentKind")} disabled={readOnly} />
        </FieldShell>
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">3 · ครอบครัว และสุขภาพ</p>
        <FieldShell id="maritalStatus" label="สถานภาพครอบครัว" required error={issueFor("maritalStatus")}>
          <Choice id="maritalStatus" options={MARITAL_OPTIONS} value={form.maritalStatus} onChange={choose("maritalStatus")} disabled={readOnly} />
        </FieldShell>
        <FieldShell id="childrenUnder6" label="จำนวนบุตรอายุไม่เกิน 6 ปี" required error={issueFor("childrenUnder6")}>
          <Choice id="childrenUnder6" options={["0", "1", "2", "3"]} value={form.childrenUnder6} onChange={choose("childrenUnder6")} disabled={readOnly} />
        </FieldShell>
        {kids > 0 ? (
          <div className="sdoc-grid">
            {(["childBirthYear1", "childBirthYear2", "childBirthYear3"] as const).slice(0, kids).map((key) => (
              <FieldShell key={key} id={key} label={`ปีเกิดบุตรคนที่ ${key.slice(-1)} (พ.ศ.)`} required error={issueFor(key)}>
                <input {...inputProps(key, { inputMode: "numeric", maxLength: 4, placeholder: "เช่น 2566" })} />
              </FieldShell>
            ))}
          </div>
        ) : null}
        <FieldShell id="bodyStatus" label="สภาพร่างกาย" required error={issueFor("bodyStatus")}>
          <Choice id="bodyStatus" options={BODY_OPTIONS} value={form.bodyStatus} onChange={choose("bodyStatus")} disabled={readOnly} />
        </FieldShell>
        {form.bodyStatus === "พิการ" ? (
          <FieldShell id="disability" label="ประเภทความพิการ" required error={issueFor("disability")}>
            <input {...inputProps("disability")} />
          </FieldShell>
        ) : null}
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">4 · ประกันสังคม</p>
        <FieldShell id="priorInsured" label="เคยเป็นผู้ประกันตนมาก่อน" required error={issueFor("priorInsured")} hint="เคยทำงานที่อื่นแล้วถูกหักประกันสังคม = เคย">
          <Choice id="priorInsured" options={PRIOR_INSURED_OPTIONS} value={form.priorInsured} onChange={choose("priorInsured")} disabled={readOnly} />
        </FieldShell>
        <FieldShell id="multiEmployer" label="ตอนนี้ทำงานกับนายจ้างที่อื่นด้วย" required error={issueFor("multiEmployer")}>
          <Choice id="multiEmployer" options={MULTI_EMPLOYER_OPTIONS} value={form.multiEmployer} onChange={choose("multiEmployer")} disabled={readOnly} />
        </FieldShell>
        {form.multiEmployer === "ใช่" ? (
          <FieldShell id="otherEmployer" label="ชื่อนายจ้างอื่น" required error={issueFor("otherEmployer")}>
            <input {...inputProps("otherEmployer")} />
          </FieldShell>
        ) : null}
        <FieldShell id="hospitalChoice" label="สถานพยาบาล (โรงพยาบาลประกันสังคม)" required error={issueFor("hospitalChoice")}>
          <select
            id="hospitalChoice"
            value={form.hospitalChoice}
            onChange={(event) => choose("hospitalChoice")(event.target.value)}
            disabled={readOnly}
            aria-invalid={Boolean(issueFor("hospitalChoice"))}
          >
            <option value="">เลือก…</option>
            {HOSPITAL_CHOICE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FieldShell>
        {form.hospitalChoice === "ไม่เปลี่ยนแปลง" || form.hospitalChoice === "ขอเปลี่ยนสถานพยาบาล" || form.priorInsured === "เคย" ? (
          <FieldShell
            id="currentHospital"
            label="สถานพยาบาลปัจจุบัน"
            required={form.hospitalChoice === "ไม่เปลี่ยนแปลง" || form.hospitalChoice === "ขอเปลี่ยนสถานพยาบาล"}
            error={issueFor("currentHospital")}
            hint="ดูได้ในแอป SSO Connect หรือบัตรรับรองสิทธิ"
          >
            <input {...inputProps("currentHospital")} />
          </FieldShell>
        ) : null}
        {ranking ? (
          <>
            <FieldShell id="hospital1" label="สถานพยาบาลที่ต้องการ ลำดับ 1" required error={issueFor("hospital1")} hint="เลือกโรงพยาบาลในเครือประกันสังคม ใกล้บ้านหรือใกล้ร้าน">
              <input {...inputProps("hospital1")} />
            </FieldShell>
            <div className="sdoc-grid">
              <FieldShell id="hospital2" label="ลำดับ 2" error={issueFor("hospital2")}>
                <input {...inputProps("hospital2")} />
              </FieldShell>
              <FieldShell id="hospital3" label="ลำดับ 3" error={issueFor("hospital3")}>
                <input {...inputProps("hospital3")} />
              </FieldShell>
            </div>
          </>
        ) : null}
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">5 · บัญชีรับเงินเดือน</p>
        <FieldShell id="bank" label="ธนาคาร" required error={issueFor("bank")}>
          <select id="bank" value={form.bank} onChange={(event) => choose("bank")(event.target.value)} disabled={readOnly} aria-invalid={Boolean(issueFor("bank"))}>
            <option value="">เลือกธนาคาร…</option>
            {BANK_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FieldShell>
        {form.bank === "อื่น ๆ" ? (
          <FieldShell id="bankOther" label="ชื่อธนาคาร" required error={issueFor("bankOther")}>
            <input {...inputProps("bankOther")} />
          </FieldShell>
        ) : null}
        <div className="sdoc-grid">
          <FieldShell id="bankAccount" label="เลขที่บัญชี" required error={issueFor("bankAccount")}>
            <input {...inputProps("bankAccount", { inputMode: "numeric", autoComplete: "off", maxLength: 20 })} />
          </FieldShell>
          <FieldShell id="bankBranch" label="สาขา" error={issueFor("bankBranch")}>
            <input {...inputProps("bankBranch")} />
          </FieldShell>
        </div>
        <FieldShell id="bankAccountName" label="ชื่อบัญชี" required error={issueFor("bankAccountName")} hint="ต้องเป็นบัญชีชื่อตัวเอง ตรงกับหน้าสมุดบัญชี">
          <input {...inputProps("bankAccountName")} />
        </FieldShell>
      </section>

      <section className="sdoc-section">
        <p className="eyebrow">6 · แนบเอกสาร</p>
        {fileBlock("idCard", true)}
        {fileBlock("bankBook", true)}
        {fileBlock("other", false)}
        <FieldShell id="note" label="หมายเหตุถึงเจ้าของร้าน" error={issueFor("note")}>
          <textarea id="note" rows={2} value={form.note} onChange={(event) => set("note", event.target.value)} disabled={readOnly} />
        </FieldShell>
      </section>

      <section className="sdoc-submit" aria-live="polite">
        {issues.length ? (
          <div className="sdoc-missing">
            <p className="sdoc-missing-title">
              <TriangleAlert size={18} aria-hidden /> ยังขาดอีก {issues.length} อย่าง ถึงจะส่งได้
            </p>
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.key}-${issue.message}`}>
                  <button type="button" className="sdoc-missing-item" onClick={() => scrollToIssue(issue)}>
                    {issue.label}
                    <span>· {issue.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="sdoc-ready">
            <CircleCheck size={18} aria-hidden /> ครบแล้ว ตรวจอีกรอบแล้วกดส่งได้เลย
          </p>
        )}
        {submitError ? <p className="sdoc-error" role="alert">{submitError}</p> : null}
        <div className="sdoc-actions">
          <button type="button" className="sdoc-btn-primary" onClick={submit} disabled={readOnly || submitting || issues.length > 0 || busyKind !== null}>
            {submitting ? <LoaderCircle className="sdoc-spin" size={18} aria-hidden /> : <Send size={18} aria-hidden />}
            {submitting ? "กำลังส่ง…" : submitCount > 0 ? "ส่งข้อมูลใหม่" : "ส่งเอกสาร"}
          </button>
          <button type="button" className="sdoc-btn-soft" onClick={resetAll} disabled={readOnly || submitting}>
            <RotateCcw size={18} aria-hidden /> {confirmReset ? "กดอีกครั้งเพื่อล้างทั้งหมด" : "ล้างข้อมูล"}
          </button>
        </div>
      </section>
    </div>
  );
}
