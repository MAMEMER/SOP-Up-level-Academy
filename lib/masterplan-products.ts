// "ข้อมูลสินค้า StoreHub" — turns a StoreHub BackOffice product export (Products → Export to
// CSV, emailed as Products_FROM-uplevel_MMDDYYYY_HHMM_….csv) into the markdown of the
// reference doc `products`, plus a compact snapshot so the next upload can say what changed.
// Pure (no I/O) — tested in tests/masterplan-products.test.ts.
//
// Rules worth knowing:
// - prices in the export are tax-inclusive; "value" = price × stock, priced items only (not cost)
// - negative stock counts as 0 in totals and is reported separately
// - a single card = Variable price whose name is "{category} - …" (or the set's parent row);
//   parent rows (referenced by another row's Parent Product SKU) are not counted as items
// - one stock column per branch: "<store name>_Quantity"

export const PRODUCTS_SLUG = "products";
export const PRODUCTS_TITLE = "ข้อมูลสินค้า StoreHub";
/** Raw CSV is ~2.5 MB today; refuse anything far bigger than a real export. */
export const MAX_PRODUCTS_CSV_BYTES = 8_000_000;

const BRANCH_LABELS: Record<string, string> = {
  "Up level Bang khae": "บางแค",
  "Uplevel SENAfest": "เสนาเฟสท์"
};

export const PRODUCT_GROUPS = [
  "ซิงเกิล Lorcana",
  "ซิงเกิล Pokémon",
  "ซิงเกิลเกมอื่น",
  "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  "อุปกรณ์เล่น",
  "ของที่ระลึก / เสื้อ / ของเล่น",
  "ขนมและเครื่องดื่ม",
  "อีเวนต์และบริการ",
  "ยังไม่จัดกลุ่ม"
] as const;
export type ProductGroup = (typeof PRODUCT_GROUPS)[number];

// StoreHub category → group, for everything that is not a single card. A category missing
// here lands in "ยังไม่จัดกลุ่ม" and is listed by name so it can be added.
const CATEGORY_GROUPS: Record<string, ProductGroup> = {
  card: "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  Box: "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  "Bootster Pack": "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  "Booster Pack": "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  Lorcana: "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  Pokemon: "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  "Rift Bound": "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  "แท็กติกเด็ค (ทั้ง 6 ชุด)": "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  "Pre order": "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  ส่วนเสริม: "กล่อง / ซอง / เด็ค (ปิดผนึก)",
  Sleeve: "อุปกรณ์เล่น",
  Playmat: "อุปกรณ์เล่น",
  Playmath: "อุปกรณ์เล่น",
  "Deck Case": "อุปกรณ์เล่น",
  อุปกรณ์: "อุปกรณ์เล่น",
  "Card Book": "อุปกรณ์เล่น",
  "เสื้อ Uplevel Academy": "ของที่ระลึก / เสื้อ / ของเล่น",
  "Paper Theater": "ของที่ระลึก / เสื้อ / ของเล่น",
  Snack: "ขนมและเครื่องดื่ม",
  Drink: "ขนมและเครื่องดื่ม",
  Event: "อีเวนต์และบริการ",
  Other: "อีเวนต์และบริการ",
  "Single card": "อีเวนต์และบริการ",
  ค่าส่งพัสดุ: "อีเวนต์และบริการ"
};

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  priceType: string;
  price: number | null;
  cost: number | null;
  /** stock per branch label, same order as ProductsParse.branches */
  stock: number[];
  group: ProductGroup;
  isParent: boolean;
};

export type ProductsParse = { branches: string[]; rows: ProductRow[] };

/** Compact record of one upload, kept so the next upload can be compared with it. */
export type ProductsSnapshot = {
  exportedAt: string | null;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  branches: string[];
  items: number;
  units: number[];
  value: number;
  sealedValue: number;
  singleUnits: number;
  negative: number;
  duplicatePairs: number;
  /** ids + names of every non-single item, same order (names for the "new / removed" lists).
   *  Two flat arrays, not [id, name] pairs: Firestore rejects nested arrays. */
  namedIds: string[];
  namedNames: string[];
  /** ids of single cards (count only) */
  singleIds: string[];
};

// ---------------------------------------------------------------- CSV

/** RFC 4180-ish: quoted fields, "" escapes, commas and newlines inside quotes, BOM stripped. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const num = (value: string | undefined): number | null => {
  const v = (value ?? "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function isSingleCard(name: string, category: string, priceType: string): boolean {
  if (!category) return false;
  // Lorcana sets are "Lorcana S12"; Thai Pokémon sets end with the set code, e.g. "(SV9s T)"
  if (/^Lorcana S\d+$/.test(category) || /\([A-Za-z0-9]+ T\)$/.test(category)) return true;
  return priceType === "Variable" && (name === category || name.startsWith(`${category} - `));
}

function groupFor(name: string, category: string, priceType: string): ProductGroup {
  if (isSingleCard(name, category, priceType)) {
    if (category.startsWith("Lorcana")) return "ซิงเกิล Lorcana";
    if (/rift/i.test(category)) return "ซิงเกิลเกมอื่น";
    return "ซิงเกิล Pokémon";
  }
  return CATEGORY_GROUPS[category] ?? "ยังไม่จัดกลุ่ม";
}

export function parseStorehubExport(text: string): { ok: true; value: ProductsParse } | { ok: false; error: string } {
  const table = parseCsv(text);
  const header = table[0]?.map((h) => h.trim()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const need = ["Product Name", "Category", "Price Type", "Tax-Inclusive Price", "Product Id"];
  const missing = need.filter((n) => col(n) < 0);
  if (missing.length) return { ok: false, error: `ไม่ใช่ไฟล์ Export สินค้าจาก StoreHub (ไม่มีคอลัมน์ ${missing.join(", ")})` };
  const qtyCols = header.map((h, i) => ({ h, i })).filter(({ h }) => h.endsWith("_Quantity"));
  if (!qtyCols.length) return { ok: false, error: "ไม่พบคอลัมน์สต็อกของสาขา (…_Quantity)" };
  const branches = qtyCols.map(({ h }) => {
    const store = h.slice(0, -"_Quantity".length);
    return BRANCH_LABELS[store] ?? store;
  });

  const at = (cells: string[], name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
  const body = table.slice(1).filter((cells) => cells.some((c) => c.trim()));
  // the second row of a StoreHub export is the template's "#Required…" help line
  const data = body.filter((cells) => !at(cells, "SKU").startsWith("#") && !at(cells, "Product Name").startsWith("Required"));
  if (!data.length) return { ok: false, error: "ไฟล์ไม่มีรายการสินค้า" };

  const parentRefs = new Set(data.map((cells) => at(cells, "Parent Product SKU")).filter(Boolean));
  const rows: ProductRow[] = data.map((cells) => {
    const name = at(cells, "Product Name");
    const category = at(cells, "Category");
    const priceType = at(cells, "Price Type");
    const id = at(cells, "Product Id");
    const sku = at(cells, "SKU");
    return {
      id,
      sku,
      name,
      category,
      priceType,
      price: num(at(cells, "Tax-Inclusive Price")),
      cost: num(at(cells, "Cost")),
      stock: qtyCols.map(({ i }) => num(cells[i]) ?? 0),
      group: groupFor(name, category, priceType),
      isParent: parentRefs.has(id) || (sku !== "" && parentRefs.has(sku))
    };
  });
  return { ok: true, value: { branches, rows } };
}

/** "Products_FROM-uplevel_10272026_2154_242256228.csv" → "2026-10-27T21:54" (Bangkok wall time). */
export function exportTimeFromFileName(fileName: string): string | null {
  const m = /_(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})/.exec(fileName);
  if (!m) return null;
  const [, mm, dd, yyyy, hh, mi] = m;
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

// ---------------------------------------------------------------- summary → markdown

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function thaiStamp(local: string | null): string {
  if (!local) return "ไม่ทราบเวลา";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local);
  if (!m) return local;
  const date = `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
  return m[4] ? `${date} ${m[4]}:${m[5]}` : date;
}
/** ISO instant → Bangkok "YYYY-MM-DDTHH:MM" */
function bangkokLocal(iso: string): string {
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const cell = (s: string) => s.replace(/\|/g, "/").replace(/[​\r\n]/g, " ").replace(/\s+/g, " ").trim();
const pos = (n: number) => Math.max(0, n);
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : "0");

type Agg = { items: number; inStock: number[]; units: number[]; priced: number; withCost: number; value: number };
const emptyAgg = (n: number): Agg => ({ items: 0, inStock: Array(n).fill(0), units: Array(n).fill(0), priced: 0, withCost: 0, value: 0 });
function add(agg: Agg, row: ProductRow) {
  agg.items++;
  row.stock.forEach((q, i) => {
    if (q > 0) agg.inStock[i]++;
    agg.units[i] += pos(q);
  });
  if (row.price) {
    agg.priced++;
    agg.value += row.price * row.stock.reduce((s, q) => s + pos(q), 0);
  }
  if (row.cost) agg.withCost++;
}

const isSingle = (g: ProductGroup) => g.startsWith("ซิงเกิล");

export type ProductsSummary = { markdown: string; snapshot: ProductsSnapshot };

export function summarizeProducts(
  parsed: ProductsParse,
  meta: { fileName: string; uploadedAt: string; uploadedBy: string; uploadedByName: string },
  previous: ProductsSnapshot | null
): ProductsSummary {
  const { branches } = parsed;
  const nb = branches.length;
  const rows = parsed.rows.filter((r) => !r.isParent);
  const exportedAt = exportTimeFromFileName(meta.fileName);

  const byGroup = new Map<ProductGroup, Agg>(PRODUCT_GROUPS.map((g) => [g, emptyAgg(nb)]));
  const byCategory = new Map<string, { group: ProductGroup; agg: Agg }>();
  const total = emptyAgg(nb);
  for (const row of rows) {
    add(byGroup.get(row.group)!, row);
    add(total, row);
    const key = `${row.group}\u0000${row.category}`;
    if (!byCategory.has(key)) byCategory.set(key, { group: row.group, agg: emptyAgg(nb) });
    add(byCategory.get(key)!.agg, row);
  }

  // data-quality checks
  const negative = rows.filter((r) => r.stock.some((q) => q < 0)).sort((a, b) => Math.min(...a.stock) - Math.min(...b.stock));
  const fixed = rows.filter((r) => r.priceType === "Fixed");
  const sameItem = new Map<string, ProductRow[]>();
  for (const r of fixed) {
    const key = `${r.name.trim()}\u0000${r.price ?? ""}`;
    sameItem.set(key, [...(sameItem.get(key) ?? []), r]);
  }
  const dupGroups = [...sameItem.values()].filter((list) => list.length > 1);
  let dupOvercount = 0;
  for (const list of dupGroups) {
    const totals = list.map((r) => r.stock.reduce((s, q) => s + pos(q), 0));
    if (totals[0] > 0 && totals.every((t) => t === totals[0])) dupOvercount += (list[0].price ?? 0) * totals[0] * (list.length - 1);
  }
  const dupPrefixes = [...new Set(dupGroups.flat().map((r) => r.sku.split("-").slice(0, 2).join("-")).filter(Boolean))].slice(0, 8);
  const zeroPriced = fixed.filter((r) => !r.price && r.stock.some((q) => q > 0));
  const zeroPricedNames = [...new Set(zeroPriced.map((r) => cell(r.name)))];
  const withCost = rows.filter((r) => r.cost);
  const costIsPrice = withCost.filter((r) => r.price && Math.abs((r.cost ?? 0) - r.price) < 0.01);
  const singles = rows.filter((r) => isSingle(r.group));
  const singlesUnpriced = singles.filter((r) => !r.price);
  const eventUnits = byGroup.get("อีเวนต์และบริการ")!.units;
  const unknownCats = [...byCategory.values()].filter((c) => c.group === "ยังไม่จัดกลุ่ม");
  const unknownNames = [...new Set(rows.filter((r) => r.group === "ยังไม่จัดกลุ่ม").map((r) => `${cell(r.category) || "(ไม่มีหมวด)"}: ${cell(r.name)}`))];

  const sealedValue = byGroup.get("กล่อง / ซอง / เด็ค (ปิดผนึก)")!.value;
  const singleUnits = singles.reduce((s, r) => s + r.stock.reduce((a, q) => a + pos(q), 0), 0);
  const snapshot: ProductsSnapshot = {
    exportedAt,
    fileName: meta.fileName.slice(0, 200),
    uploadedAt: meta.uploadedAt,
    uploadedBy: meta.uploadedBy,
    branches,
    items: total.items,
    units: total.units,
    value: Math.round(total.value),
    sealedValue: Math.round(sealedValue),
    singleUnits,
    negative: negative.length,
    duplicatePairs: dupGroups.length,
    namedIds: rows.filter((r) => !isSingle(r.group)).map((r) => r.id),
    namedNames: rows.filter((r) => !isSingle(r.group)).map((r) => r.name.slice(0, 120)),
    singleIds: singles.map((r) => r.id)
  };

  const L: string[] = [];
  const branchCols = branches.map((b) => `มีของที่${b} (รายการ / ชิ้น)`).join(" | ");
  L.push(`# ${PRODUCTS_TITLE}`, "");
  L.push(
    `**ที่มา:** ไฟล์ Export สินค้าจาก StoreHub BackOffice ณ **${thaiStamp(exportedAt)}** · ${nb} สาขา (${branches.join(" / ")}) · อัปโหลดโดย ${meta.uploadedByName} เมื่อ ${thaiStamp(bangkokLocal(meta.uploadedAt))}`,
    "",
    `**หมายเหตุ:** ราคาเป็นราคารวม VAT · มูลค่า = ราคาขาย × สต็อก นับเฉพาะสินค้าที่ตั้งราคาแล้ว (ไม่ใช่ต้นทุน) · สต็อกติดลบนับเป็น 0 · ไม่นับแถวหัวของสินค้าที่มีตัวเลือกย่อย`,
    "",
    "**อัปเดต:** StoreHub → สินค้า → Export to CSV (ไฟล์ส่งเข้าอีเมล uplevel.ad) → กดปุ่ม \"อัปโหลดไฟล์ StoreHub\" ด้านบนหน้านี้ ใช้ได้ทั้งไฟล์ .csv และ .zip",
    ""
  );

  L.push("## สรุปตามกลุ่มสินค้า", "");
  L.push(`| กลุ่ม | รายการ | ${branchCols} | ตั้งราคาแล้ว | มีต้นทุน | มูลค่าตามราคาขาย (฿) |`);
  L.push(`|---|---|${branches.map(() => "---|").join("")}---|---|---|`);
  for (const [g, a] of byGroup) {
    if (!a.items) continue;
    const per = a.inStock.map((n, i) => `${fmt(n)} / ${fmt(a.units[i])}`).join(" | ");
    L.push(`| ${g} | ${fmt(a.items)} | ${per} | ${fmt(a.priced)} | ${fmt(a.withCost)} | ${a.value ? fmt(a.value) : "—"} |`);
  }
  L.push(
    `| **รวม** | **${fmt(total.items)}** | ${total.inStock.map((n, i) => `**${fmt(n)} / ${fmt(total.units[i])}**`).join(" | ")} | **${fmt(total.priced)}** | **${fmt(total.withCost)}** | **${fmt(total.value)}** |`,
    ""
  );
  if (singles.length) L.push(`- ซิงเกิล ${fmt(singles.length)} รายการ (${Math.round((singles.length / Math.max(1, total.items)) * 100)}% ของทั้งหมด) · ตั้งราคาแล้ว ${fmt(singles.length - singlesUnpriced.length)} รายการ`);
  if (eventUnits.some((u) => u > 0)) L.push(`- ชิ้นในกลุ่มอีเวนต์ (${eventUnits.map((u, i) => `${branches[i]} ${fmt(u)}`).join(" · ")}) คือยอดตั๋ว/สิทธิ์อีเวนต์ ไม่ใช่ของบนชั้น`);
  if (dupGroups.length) L.push(`- มูลค่ารวมของที่สร้างรหัสซ้ำไว้ด้วย (ดูหัวข้อจุดที่ข้อมูลยังไม่สะอาด)`);
  L.push("");

  L.push("## เปลี่ยนไปจากครั้งก่อน", "");
  if (!previous) {
    L.push("ครั้งแรกที่อัปโหลด — ครั้งถัดไปจะเทียบกับไฟล์นี้ให้อัตโนมัติ", "");
  } else {
    const prevIds = new Set([...previous.namedIds, ...previous.singleIds]);
    const nowIds = new Set(rows.map((r) => r.id));
    const added = rows.filter((r) => !prevIds.has(r.id));
    const removedNamed = previous.namedIds.map((id, i) => ({ id, name: previous.namedNames[i] ?? id })).filter((p) => !nowIds.has(p.id));
    const removedSingles = previous.singleIds.filter((id) => !nowIds.has(id)).length;
    L.push(`เทียบกับไฟล์ ณ ${thaiStamp(previous.exportedAt)}`, "");
    L.push(`| | ครั้งก่อน | ครั้งนี้ | เปลี่ยน |`, `|---|---|---|---|`);
    L.push(`| รายการสินค้า | ${fmt(previous.items)} | ${fmt(total.items)} | ${signed(total.items - previous.items)} |`);
    branches.forEach((b, i) => {
      const pi = previous.branches.indexOf(b);
      const before = pi >= 0 ? previous.units[pi] : 0;
      L.push(`| ชิ้นที่${b} | ${fmt(before)} | ${fmt(total.units[i])} | ${signed(total.units[i] - before)} |`);
    });
    L.push(`| ซิงเกิล (ใบ) | ${fmt(previous.singleUnits)} | ${fmt(singleUnits)} | ${signed(singleUnits - previous.singleUnits)} |`);
    L.push(`| มูลค่าสินค้าปิดผนึก (฿) | ${fmt(previous.sealedValue)} | ${fmt(sealedValue)} | ${signed(sealedValue - previous.sealedValue)} |`);
    L.push(`| มูลค่ารวมตามราคาขาย (฿) | ${fmt(previous.value)} | ${fmt(total.value)} | ${signed(total.value - previous.value)} |`);
    L.push(`| สต็อกติดลบ (รายการ) | ${fmt(previous.negative)} | ${fmt(negative.length)} | ${signed(negative.length - previous.negative)} |`);
    L.push(`| รหัสซ้ำ (คู่) | ${fmt(previous.duplicatePairs)} | ${fmt(dupGroups.length)} | ${signed(dupGroups.length - previous.duplicatePairs)} |`, "");
    const addedNonSingle = added.filter((r) => !isSingle(r.group));
    const addedSingles = added.length - addedNonSingle.length;
    if (added.length) {
      const names = addedNonSingle.slice(0, 40).map((r) => cell(r.name));
      L.push(`- **รายการใหม่ ${fmt(added.length)} รายการ**${addedSingles ? ` (ซิงเกิล ${fmt(addedSingles)})` : ""}${names.length ? `: ${names.join(" · ")}${addedNonSingle.length > 40 ? ` และอีก ${addedNonSingle.length - 40}` : ""}` : ""}`);
    }
    if (removedNamed.length || removedSingles) {
      const names = removedNamed.slice(0, 40).map((p) => cell(p.name));
      L.push(`- **รายการที่หายไป ${fmt(removedNamed.length + removedSingles)} รายการ**${removedSingles ? ` (ซิงเกิล ${fmt(removedSingles)})` : ""}${names.length ? `: ${names.join(" · ")}` : ""}`);
    }
    if (!added.length && !removedNamed.length && !removedSingles) L.push("- ไม่มีรายการเพิ่มหรือหาย");
    L.push("");
  }

  L.push("## แยกตามหมวดใน StoreHub (ไม่รวมซิงเกิล)", "");
  L.push(`| กลุ่ม | หมวด | รายการ | ${branches.map((b) => `ชิ้น${b}`).join(" | ")} | มูลค่า (฿) |`);
  L.push(`|---|---|---|${branches.map(() => "---|").join("")}---|`);
  const cats = [...byCategory.entries()]
    .filter(([, c]) => !isSingle(c.group))
    .sort((a, b) => PRODUCT_GROUPS.indexOf(a[1].group) - PRODUCT_GROUPS.indexOf(b[1].group) || b[1].agg.value - a[1].agg.value);
  for (const [key, c] of cats) {
    const category = key.split("\u0000")[1] || "(ไม่มีหมวด)";
    L.push(`| ${c.group} | ${cell(category)} | ${fmt(c.agg.items)} | ${c.agg.units.map((u) => fmt(u)).join(" | ")} | ${c.agg.value ? fmt(c.agg.value) : "—"} |`);
  }
  L.push("");

  if (singles.length) {
    L.push("## ซิงเกิลแยกตามชุด (จำนวนใบ)", "");
    for (const g of PRODUCT_GROUPS.filter(isSingle)) {
      const sets = [...byCategory.entries()].filter(([, c]) => c.group === g).sort((a, b) => b[1].agg.units.reduce((s, u) => s + u, 0) - a[1].agg.units.reduce((s, u) => s + u, 0));
      if (!sets.length) continue;
      const parts = sets.map(([key, c]) => `${cell(key.split("\u0000")[1])} ${fmt(c.agg.units.reduce((s, u) => s + u, 0))}`);
      L.push(`**${g.replace("ซิงเกิล ", "")}:** ${parts.join(" · ")}`, "");
    }
  }

  L.push("## จุดที่ข้อมูลยังไม่สะอาด", "");
  const issues: string[] = [];
  if (dupGroups.length)
    issues.push(
      `**สินค้าชื่อและราคาเดียวกันมีหลายรหัส ${fmt(dupGroups.length)} ชุด**${dupPrefixes.length ? ` (SKU ${dupPrefixes.join(" / ")} …)` : ""}${dupOvercount ? ` → มูลค่าสต็อกอาจนับเกินราว **${fmt(dupOvercount)} ฿**` : ""} ต้องนับของจริงแล้วลบรหัสที่ซ้ำ`
    );
  if (negative.length)
    issues.push(
      `**สต็อกติดลบ ${fmt(negative.length)} รายการ** เช่น ${negative
        .slice(0, 6)
        .map((r) => `${cell(r.name)} ${r.stock.map((q, i) => (q < 0 ? `${branches[i]} −${fmt(-q)}` : "")).filter(Boolean).join(" ")}`)
        .join(" · ")} → ขายออกโดยยังไม่ได้บันทึกรับเข้า`
    );
  if (singlesUnpriced.length) issues.push(`**ซิงเกิล ${fmt(singlesUnpriced.length)} รายการยังไม่มีราคา** → คิดมูลค่าสต็อกซิงเกิลและกำไรขั้นต้นจาก StoreHub ไม่ได้`);
  issues.push(
    `**มีต้นทุน ${fmt(withCost.length)} จาก ${fmt(total.items)} รายการ**${costIsPrice.length ? ` และ ${fmt(costIsPrice.length)} รายการกรอกต้นทุนเท่ากับราคาขาย` : ""} → ต้นทุนที่ใช้คิดกำไรได้จริงยังน้อย`
  );
  if (zeroPricedNames.length) issues.push(`**มีของแต่ราคาเป็น 0 จำนวน ${fmt(zeroPriced.length)} รายการ:** ${zeroPricedNames.slice(0, 15).join(" · ")}`);
  if (unknownCats.length) issues.push(`**หมวดที่ยังไม่จัดกลุ่ม (เพิ่มในระบบได้):** ${unknownNames.slice(0, 15).join(" · ")}`);
  issues.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  L.push("");

  return { markdown: L.join("\n"), snapshot };
}

// ---------------------------------------------------------------- browser-side prep

/** Columns the summary needs; the browser drops the rest before upload (~2.5 MB → under 1 MB). */
const KEEP_COLUMNS = ["SKU", "Parent Product SKU", "Product Name", "Category", "Price Type", "Tax-Inclusive Price", "Cost", "Product Id"];
const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function slimStorehubCsv(text: string): string {
  const table = parseCsv(text);
  const header = table[0]?.map((h) => h.trim()) ?? [];
  const keep = header.map((h, i) => ({ h, i })).filter(({ h }) => KEEP_COLUMNS.includes(h) || h.endsWith("_Quantity"));
  if (!keep.length) return text;
  return table.map((cells) => keep.map(({ i }) => quote(cells[i] ?? "")).join(",")).join("\n");
}

/**
 * The first .csv inside a .zip (StoreHub emails the export zipped). Reads the central
 * directory for sizes (entries may use data descriptors) and inflates with the platform's
 * DecompressionStream("deflate-raw") — browsers and Node 18+.
 */
export async function csvFromZip(bytes: Uint8Array): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("ไฟล์ .zip เสีย หรือไม่ใช่ไฟล์ zip");
  const entries = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder("utf-8");
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.csv$/i.test(name) || name.startsWith("__MACOSX/")) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    if (method === 0) return decoder.decode(data);
    if (method !== 8) throw new Error("ไฟล์ zip ใช้การบีบอัดแบบที่ยังไม่รองรับ");
    const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return decoder.decode(await new Response(stream).arrayBuffer());
  }
  throw new Error("ไม่พบไฟล์ .csv ใน zip");
}
