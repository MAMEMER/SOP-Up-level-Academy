import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

// bug-reports/crawf8V4GOzvOm5SaRC1 — the schedule calendar (.staff-calendar) renders a
// fixed 7-column month grid. On a phone each column collapses to ~44px, so the per-day
// time ranges and teammate names overflow their cell and overlap the neighbouring day,
// making the calendar unreadable. The fix stacks the days into a single full-width column
// under a phone-width media query. These tests guard that responsive rule so a future CSS
// edit cannot silently reintroduce the 7-column squeeze on mobile.

const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8"
);

/** Extract the body of every `@media (max-width: …px)` block whose max-width ≤ limit. */
function phoneMediaBlocks(limit: number): string[] {
  const blocks: string[] = [];
  const re = /@media\s*\(max-width:\s*(\d+)px\s*\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    if (Number(match[1]) > limit) continue;
    // walk braces from the opening `{` to find the matching close
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}

describe("staff-calendar mobile layout — bug crawf8V4", () => {
  const phoneCss = phoneMediaBlocks(600).join("\n");

  it("collapses the week row to a single column on phones", () => {
    const weekRule = /\.staff-calendar__week\s*\{[^}]*grid-template-columns:\s*1fr/;
    assert.match(
      phoneCss,
      weekRule,
      "expected .staff-calendar__week to use a single-column grid inside a ≤600px media query"
    );
  });

  it("hides the empty padding cells so stacked days stay flush", () => {
    const padRule = /\.staff-calendar__day\.is-pad\s*\{[^}]*display:\s*none/;
    assert.match(
      phoneCss,
      padRule,
      "expected .staff-calendar__day.is-pad to be hidden on phones"
    );
  });

  it("keeps the 7-column grid on desktop (rule lives only under a media query)", () => {
    // The base (non-media) declaration must still be the 7-column grid.
    const base = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "");
    assert.match(
      base,
      /\.staff-calendar__head,\s*\.staff-calendar__week\s*\{[^}]*repeat\(7/,
      "desktop calendar should remain a 7-column grid"
    );
  });
});
