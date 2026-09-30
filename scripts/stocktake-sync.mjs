#!/usr/bin/env node
// ดึงผลนับ Stock Take (น้ำ/ขนม) จาก StoreHub BackOffice → Firestore `sop_stocktakes`
// ให้หน้า /admin/stock-loss คำนวณของหายช่วงไหนก็ได้
//
// StoreHub Open API ไม่มี stocktake จึงต้องอ่านผ่าน BackOffice ด้วย session จริง:
// Chrome profile ~/.agent-browser/chrome-profile (CDP 9222, headless) ที่ล็อกอิน Google ของแชมป์ไว้
// → /auth/google เข้าได้เงียบๆ → เรียก endpoint ภายในของหน้า Stock Take ตรงๆ
//   GET  /stocks/ajaxStockTakesWithCount?from=MM/DD/YYYY&to=MM/DD/YYYY
//   POST /stocks/stocktakes/ajaxCountedItemsWithCount  id=<stocktakeId>
//
// ใช้: node scripts/stocktake-sync.mjs [--days 10]
// Service account: $GOOGLE_APPLICATION_CREDENTIALS หรือ admin JSON ของ up-level-guild ใน members-web

import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const CDP_PORT = 9222;
const PROFILE = join(homedir(), ".agent-browser/chrome-profile");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BACKOFFICE = "https://uplevel.storehubhq.com";
const COLLECTION = "sop_stocktakes";
const SNACK_SUPPLIER = "น้ำ,ขนม";

const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg > 0 ? Number(process.argv[daysArg + 1]) || 10 : 10;

const ab = (...args) => execFileSync("agent-browser", args, { encoding: "utf8", timeout: 120_000 }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cdpUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureChrome() {
  if (await cdpUp()) return;
  // headless เสมอ — ห้ามเด้งหน้าต่างแย่งโฟกัสแชมป์
  spawn(CHROME, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, "about:blank"], {
    detached: true,
    stdio: "ignore"
  }).unref();
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await cdpUp()) return;
  }
  throw new Error("Chrome CDP 9222 ไม่ขึ้น");
}

async function openLoggedIn() {
  ab("connect", String(CDP_PORT));
  ab("open", `${BACKOFFICE}/stocks/stocktakes`);
  await sleep(3000);
  if (!ab("get", "url").includes("/login")) return;
  ab("open", `${BACKOFFICE}/auth/google`);
  await sleep(7000);
  ab("open", `${BACKOFFICE}/stocks/stocktakes`);
  await sleep(3000);
  if (ab("get", "url").includes("/login")) {
    throw new Error("StoreHub BackOffice ล็อกอินไม่ได้ — Google ใน chrome-profile หลุด ให้แชมป์ล็อกอินใหม่");
  }
}

const mdY = (d) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;

function bangkokDay(offsetDays) {
  return new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000);
}

/** "09/30/2026 22:22" (เวลาไทย) → ms */
function parseBkk(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return undefined;
  return Date.parse(`${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:00+07:00`);
}

function pageScript(from, to, supplier) {
  return `(async () => {
    const q = new URLSearchParams({ sEcho: 1, iColumns: 6, iDisplayStart: 0, iDisplayLength: 1000, from: ${JSON.stringify(from)}, to: ${JSON.stringify(to)} });
    const list = await fetch("/stocks/ajaxStockTakesWithCount?" + q).then((r) => r.json());
    const out = [];
    for (const row of list.aaData || []) {
      const entry = { id: row.DT_RowId, start: row[0], completed: row[1], supplier: row[4], status: row[5], items: [] };
      if (entry.supplier === ${JSON.stringify(supplier)} && /complete/i.test(entry.status)) {
        const body = new URLSearchParams({ sEcho: 1, iColumns: 7, iDisplayStart: 0, iDisplayLength: 5000, id: entry.id });
        const res = await fetch("/stocks/stocktakes/ajaxCountedItemsWithCount", {
          method: "POST",
          body,
          headers: { "X-Requested-With": "XMLHttpRequest" }
        }).then((r) => r.json());
        entry.items = (res.aaData || []).map((it) => [it[1], it[0], Number(it[3]), Number(it[4])]);
      }
      out.push(entry);
    }
    return JSON.stringify(out);
  })()`;
}

function firestore() {
  const path =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    join(homedir(), "Projects/up-level-guild-members-web/up-level-guild-firebase-adminsdk-fbsvc-bb54b4f16c.json");
  if (!existsSync(path)) throw new Error(`ไม่เจอ service account: ${path}`);
  initializeApp({ credential: cert(JSON.parse(readFileSync(path, "utf8"))) });
  return getFirestore();
}

async function main() {
  await ensureChrome();
  await openLoggedIn();
  const raw = ab("eval", pageScript(mdY(bangkokDay(-DAYS)), mdY(bangkokDay(0)), SNACK_SUPPLIER));
  // agent-browser พิมพ์ค่าที่ eval คืนมาเป็น JSON string อีกชั้น
  const rows = JSON.parse(JSON.parse(raw));

  const db = firestore();
  const batch = db.batch();
  let written = 0;
  for (const row of rows) {
    if (row.supplier !== SNACK_SUPPLIER) continue;
    const startAt = parseBkk(row.start);
    if (!startAt) continue;
    const status = /complete/i.test(row.status) ? "Completed" : /cancel/i.test(row.status) ? "Cancelled" : "In Progress";
    batch.set(db.collection(COLLECTION).doc(row.id), {
      startAt,
      completedAt: parseBkk(row.completed) ?? null,
      status,
      supplier: row.supplier,
      items: JSON.stringify(row.items)
    });
    written += 1;
  }
  batch.set(db.collection(COLLECTION).doc("_meta"), { syncedAt: Date.now(), days: DAYS }, { merge: true });
  await batch.commit();
  console.log(`stocktake-sync: ${written} stocktakes (last ${DAYS} days) → ${COLLECTION}`);
}

main().catch((err) => {
  console.error(`stocktake-sync failed: ${err.message}`);
  process.exit(1);
});
