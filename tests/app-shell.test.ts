import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("app shell topbar", () => {
  it("renders a digital clock before the user email chip", () => {
    const source = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
    const clockIndex = source.indexOf("<DigitalClock");
    const emailIndex = source.indexOf("className=\"user-chip\"");

    assert.notEqual(clockIndex, -1);
    assert.notEqual(emailIndex, -1);
    assert.equal(clockIndex < emailIndex, true);
  });

  it("does not server-render a volatile clock value before hydration", () => {
    const source = readFileSync(new URL("../components/DigitalClock.tsx", import.meta.url), "utf8");

    assert.equal(source.includes("useState(() => new Date())"), false);
    assert.equal(source.includes('useState("00:00:00")'), true);
  });
});
