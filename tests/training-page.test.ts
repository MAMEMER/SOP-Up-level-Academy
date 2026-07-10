import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("training manual page", () => {
  it("uses a WI working instruction structure with complete steps and images", () => {
    const source = readFileSync(new URL("../app/(dashboard)/training/page.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("WI Working Instruction"), true);
    assert.equal(source.includes("ขั้นตอนการปฏิบัติงาน"), true);
    assert.equal(source.includes("<img"), true);
    assert.equal(source.includes("slice("), false);
  });

  it("documents the required mobile Stock Take screenshot evidence", () => {
    const source = readFileSync(new URL("../app/(dashboard)/training/page.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("หน้า Stock Take ในมือถือ"), true);
    assert.equal(source.includes("Start New Stock Take"), true);
    assert.equal(source.includes("Ongoing Session"), true);
    assert.equal(source.includes("In Progress"), true);
  });

  it("documents the opening snack shelf photo evidence", () => {
    const source = readFileSync(new URL("../app/(dashboard)/training/page.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("ชั้นวางขนมเปิดร้าน"), true);
    assert.equal(source.includes("/training/snack-shelf-opening.jpg"), true);
    assert.equal(source.includes("ถ่ายให้เห็นชั้นวางขนมและน้ำ"), true);
  });

  it("lets staff open each WI sample image from the manual", () => {
    const source = readFileSync(new URL("../app/(dashboard)/training/page.tsx", import.meta.url), "utf8");

    assert.equal(source.includes('<a className="wi-image-link" href={media.src}'), true);
    assert.equal(source.includes("กดดูรูปตัวอย่างเต็ม"), true);
  });
});
