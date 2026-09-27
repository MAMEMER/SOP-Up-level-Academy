// Smoke test for the Drive bridge (gas/staff-documents) with FAKE data only.
//   node --experimental-strip-types scripts/staff-docs-drive-smoke.ts
// Needs STAFF_DOCS_GAS_URL + STAFF_DOCS_GAS_SECRET (env or .env.local).
// Writes employee TEST-SMOKE (ID 0000000000000) → reads it back → purges it (folder to trash + sheet row deleted).
import { readFileSync } from "node:fs";
import { SHEET_DATE_COLUMNS, SHEET_HEADERS, SHEET_TEXT_COLUMNS, driveFileName, prefillForm, sheetRowFor } from "../lib/staff-documents.ts";

function env(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  try {
    const match = readFileSync(".env.local", "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    return match ? match[1].replace(/^"|"$/g, "") : "";
  } catch {
    return "";
  }
}

const url = env("STAFF_DOCS_GAS_URL");
const secret = env("STAFF_DOCS_GAS_SECRET");
if (!url || !secret) throw new Error("STAFF_DOCS_GAS_URL / STAFF_DOCS_GAS_SECRET missing");

async function call(payload: Record<string, unknown>) {
  const res = await fetch(url, { method: "POST", body: JSON.stringify({ ...payload, secret }), redirect: "follow" });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `bad_response_${res.status}` };
  }
}

const employeeId = "TEST-SMOKE";
const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const form = {
  ...prefillForm({ email: "test.smoke@example.com", employmentType: "part_time" }),
  title: "นาย",
  firstNameTh: "ทดสอบ",
  lastNameTh: "สโมค",
  firstNameEn: "Test",
  lastNameEn: "Smoke",
  nationalId: "0000000000000",
  birthDate: "2000-01-01",
  phone: "0800000000",
  address: "TEST ONLY - ที่อยู่ปลอม",
  startDate: "2026-09-01",
  bank: "กสิกรไทย",
  bankAccount: "0000000000",
  bankAccountName: "TEST ONLY"
};

console.log("ping", await call({ action: "ping" }));
const submit = await call({
  action: "submit",
  submissionId: `smoke-${Date.now()}`,
  employeeId,
  folderName: `${employeeId} สโมค`,
  headers: SHEET_HEADERS,
  dateColumns: SHEET_DATE_COLUMNS,
  textColumns: SHEET_TEXT_COLUMNS,
  row: sheetRowFor(form, { employeeId, nickname: "สโมค", branchLabel: "บางแค", submittedAtLabel: "smoke", submitCount: 1 }),
  files: [{ kind: "idCard", name: driveFileName(employeeId, "สโมค", "idCard", "image/png"), mimeType: "image/png", base64: PNG_1x1 }],
  test: true
});
console.log("submit", submit);
const got = await call({ action: "get", employeeId });
console.log("get", got.ok ? { id: got.row?.[1], nationalId: got.row?.[8], birth: got.row?.[10] } : got);
if (process.argv.includes("--keep")) process.exit(0);
console.log("purge", await call({ action: "purgeTest", employeeId }));
console.log("get after purge", await call({ action: "get", employeeId }));
