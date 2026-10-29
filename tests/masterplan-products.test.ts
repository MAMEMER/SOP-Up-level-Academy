import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  csvFromZip,
  exportTimeFromFileName,
  isSingleCard,
  parseCsv,
  parseStorehubExport,
  slimStorehubCsv,
  summarizeProducts
} from "../lib/masterplan-products.ts";

const HEADER =
  '"SKU","Parent Product SKU","Product Name","Category","Price Type","Tax-Inclusive Price","Cost","Up level Bang khae_Quantity","Uplevel SENAfest_Quantity","Product Id","Product Description"';
const HELP = '"#Required(Must be unique)","","Required","Optional","Required(Fixed/Variable/Unit)","","","","","",""';
const row = (cells: string[]) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");

function exportCsv(rows: string[][]) {
  return "﻿" + [HEADER, HELP, ...rows.map(row)].join("\r\n");
}

const BASE = [
  // sku, parent, name, category, priceType, price, cost, bk, sena, id, desc
  ["", "", "Lorcana S12", "Lorcana S12", "Variable", "", "", "", "", "p-l12", ""],
  ["1/204/en/12", "p-l12", "Lorcana S12 - Ariel - Spectacular Singer", "Lorcana S12", "Variable", "", "", "3", "", "c1", ""],
  ["SV9sT-1", "", "สายใยแห่งโชคชะตา (SV9s T) - ฮิบิกิ (U · SV9s T 1/139)", "สายใยแห่งโชคชะตา (SV9s T)", "Variable", "", "", "5", "", "c2", ""],
  ["BOX-1", "", "BOX 1700฿", "card", "Fixed", "1700.00", "1700.00", "2", "", "b1", "line one,\nline \"two\""],
  ["SENA-SLV-1", "", "Sleeve ใส", "Sleeve", "Fixed", "100.00", "60.00", "", "4", "s1", ""],
  ["SENA-SLV-2", "", "Sleeve ใส", "Sleeve", "Fixed", "100.00", "", "", "4", "s2", ""],
  ["PK-30", "", "Booster Pack 30 ปี", "Pokemon", "Fixed", "100.00", "", "", "-3", "bp", ""],
  ["ZERO", "", "Lorcana Set 13", "Bootster Pack", "Fixed", "0.00", "", "", "10", "z1", ""],
  ["X", "", "ของแปลก", "หมวดใหม่", "Fixed", "50.00", "", "1", "", "u1", ""]
];

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines in fields", () => {
    assert.deepEqual(parseCsv('a,"b,c","d ""e""\nf"\r\n1,2,3'), [
      ["a", "b,c", 'd "e"\nf'],
      ["1", "2", "3"]
    ]);
  });
});

describe("isSingleCard", () => {
  it("recognises Lorcana and Thai Pokémon sets, not sealed product", () => {
    assert.equal(isSingleCard("Lorcana S1 - Abu", "Lorcana S1", "Variable"), true);
    assert.equal(isSingleCard("สายใยแห่งโชคชะตา (SV9s", "สายใยแห่งโชคชะตา (SV9s T)", "Fixed"), true);
    assert.equal(isSingleCard("วอยด์บลาสต์ - ฟุชิกิดาเนะ (MA4 1/120)", "วอยด์บลาสต์", "Variable"), true);
    assert.equal(isSingleCard("Lorcana Booster Pack (Set1)", "Lorcana", "Variable"), false);
    assert.equal(isSingleCard("BOX 1700฿", "card", "Fixed"), false);
  });
});

describe("exportTimeFromFileName", () => {
  it("reads MMDDYYYY_HHMM from the StoreHub file name", () => {
    assert.equal(exportTimeFromFileName("Products_FROM-uplevel_10272026_2154_242256228.csv"), "2026-10-27T21:54");
    assert.equal(exportTimeFromFileName("whatever.csv"), null);
  });
});

describe("parseStorehubExport", () => {
  it("rejects files that are not a StoreHub product export", () => {
    const res = parseStorehubExport("a,b\n1,2");
    assert.equal(res.ok, false);
  });

  it("reads branches, skips the help row and marks parent rows", () => {
    const res = parseStorehubExport(exportCsv(BASE));
    assert.ok(res.ok);
    assert.deepEqual(res.value.branches, ["บางแค", "เสนาเฟสท์"]);
    assert.equal(res.value.rows.length, BASE.length);
    assert.equal(res.value.rows.find((r) => r.id === "p-l12")?.isParent, true);
    assert.equal(res.value.rows.find((r) => r.id === "c2")?.group, "ซิงเกิล Pokémon");
    assert.equal(res.value.rows.find((r) => r.id === "u1")?.group, "ยังไม่จัดกลุ่ม");
  });
});

describe("summarizeProducts", () => {
  const meta = { fileName: "Products_FROM-uplevel_10102026_1357_1.csv", uploadedAt: "2026-10-10T08:00:00.000Z", uploadedBy: "name", uploadedByName: "เนม" };
  const parse = (rows: string[][]) => {
    const res = parseStorehubExport(exportCsv(rows));
    assert.ok(res.ok);
    return res.value;
  };

  it("totals per branch, flags duplicates, negative stock, zero price and unknown categories", () => {
    const { markdown, snapshot } = summarizeProducts(parse(BASE), meta, null);
    assert.equal(snapshot.items, BASE.length - 1); // parent row not counted
    assert.deepEqual(snapshot.units, [11, 18]); // 3+5+2+1 · 4+4+10 (−3 counts as 0)
    assert.equal(snapshot.value, 1700 * 2 + 100 * 4 * 2 + 50);
    assert.equal(snapshot.negative, 1);
    assert.equal(snapshot.duplicatePairs, 1);
    assert.equal(snapshot.singleUnits, 8);
    assert.match(markdown, /10 ต\.ค\. 2569 13:57/);
    assert.match(markdown, /ครั้งแรกที่อัปโหลด/);
    assert.match(markdown, /มูลค่าสต็อกอาจนับเกินราว \*\*400 ฿\*\*/);
    assert.match(markdown, /Booster Pack 30 ปี เสนาเฟสท์ −3/);
    assert.match(markdown, /ราคาเป็น 0 จำนวน 1 รายการ:\*\* Lorcana Set 13/);
    assert.match(markdown, /กรอกต้นทุนเท่ากับราคาขาย/);
    assert.match(markdown, /หมวดใหม่: ของแปลก/);
    // snapshot must be Firestore-safe: no nested arrays
    for (const value of Object.values(snapshot)) {
      if (Array.isArray(value)) assert.ok(value.every((v) => !Array.isArray(v)));
    }
  });

  it("compares with the previous upload", () => {
    const first = summarizeProducts(parse(BASE), meta, null);
    const next = BASE.filter((r) => r[9] !== "u1").concat([["NEW", "", "Lorcana Starter Deck Set 14", "Lorcana", "Fixed", "690.00", "", "6", "", "n1", ""]]);
    const { markdown } = summarizeProducts(parse(next), { ...meta, fileName: "Products_FROM-uplevel_10272026_2154_2.csv" }, first.snapshot);
    assert.match(markdown, /เทียบกับไฟล์ ณ 10 ต\.ค\. 2569 13:57/);
    assert.match(markdown, /รายการใหม่ 1 รายการ\*\*: Lorcana Starter Deck Set 14/);
    assert.match(markdown, /รายการที่หายไป 1 รายการ\*\*: ของแปลก/);
    assert.match(markdown, /\| ชิ้นที่บางแค \| 11 \| 16 \| \+5 \|/);
  });
});

describe("browser prep", () => {
  it("slims the CSV to the columns the summary needs and still parses", () => {
    const slim = slimStorehubCsv(exportCsv(BASE));
    assert.doesNotMatch(slim.split("\n")[0], /Product Description/);
    const res = parseStorehubExport(slim);
    assert.ok(res.ok);
    assert.equal(res.value.rows.length, BASE.length);
  });

  it("extracts the CSV from a zip (deflate)", async () => {
    const csv = exportCsv(BASE);
    const name = new TextEncoder().encode("Products.csv");
    const data = deflateRawSync(Buffer.from(csv, "utf8"));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const cdOffset = local.length + name.length + data.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + name.length, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    const zip = Buffer.concat([local, name, data, central, name, eocd]);
    assert.equal(await csvFromZip(new Uint8Array(zip)), csv.slice(1)); // TextDecoder drops the BOM
  });
});
