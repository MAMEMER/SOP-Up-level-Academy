import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  firstInvalidLink,
  isValidLinkUrl,
  linkHostname,
  linkLabel,
  normalizeLinks
} from "../lib/checklist-links.ts";

describe("checklist links — url validation", () => {
  it("accepts absolute https urls and internal /paths only", () => {
    assert.equal(isValidLinkUrl("https://uplevel.storehubhq.com/stocks"), true);
    assert.equal(isValidLinkUrl("https://guild.uplevelguild.com/admin"), true);
    assert.equal(isValidLinkUrl("/handoff"), true);
    assert.equal(isValidLinkUrl("/monthly-summary?tab=cash"), true);
  });

  it("rejects http, protocol-relative, other schemes, and bare text", () => {
    assert.equal(isValidLinkUrl("http://insecure.com"), false);
    assert.equal(isValidLinkUrl("//evil.com"), false);
    assert.equal(isValidLinkUrl("javascript:alert(1)"), false);
    assert.equal(isValidLinkUrl("mailto:x@y.com"), false);
    assert.equal(isValidLinkUrl("storehub.com"), false);
    assert.equal(isValidLinkUrl(""), false);
    assert.equal(isValidLinkUrl("   "), false);
    assert.equal(isValidLinkUrl(undefined), false);
    assert.equal(isValidLinkUrl("https://"), false);
  });

  it("trims before validating", () => {
    assert.equal(isValidLinkUrl("  https://a.com/b  "), true);
    assert.equal(isValidLinkUrl("  /path  "), true);
  });
});

describe("checklist links — hostname + label fallback", () => {
  it("returns the host without www for an https url", () => {
    assert.equal(linkHostname("https://www.google.com/sheets/x"), "google.com");
    assert.equal(linkHostname("https://uplevel.storehubhq.com/stocks/supplyNeeds"), "uplevel.storehubhq.com");
  });

  it("shows an internal path as-is and empty for garbage", () => {
    assert.equal(linkHostname("/handoff"), "/handoff");
    assert.equal(linkHostname("not a url"), "");
    assert.equal(linkHostname(""), "");
  });

  it("uses the explicit label, else the hostname, else the raw url", () => {
    assert.equal(linkLabel({ label: "StoreHub", url: "https://uplevel.storehubhq.com" }), "StoreHub");
    assert.equal(linkLabel({ label: "", url: "https://uplevel.storehubhq.com/x" }), "uplevel.storehubhq.com");
    assert.equal(linkLabel({ label: "   ", url: "/handoff" }), "/handoff");
  });
});

describe("checklist links — normalize + first invalid", () => {
  it("keeps valid links, trims labels, drops invalid/empty rows", () => {
    const out = normalizeLinks([
      { label: "  StoreHub  ", url: "  https://uplevel.storehubhq.com  " },
      { label: "bad", url: "http://insecure.com" },
      { label: "blank", url: "   " },
      { label: "", url: "/handoff" },
      "garbage",
      null
    ]);
    assert.deepEqual(out, [
      { label: "StoreHub", url: "https://uplevel.storehubhq.com" },
      { label: "", url: "/handoff" }
    ]);
  });

  it("returns [] for non-arrays", () => {
    assert.deepEqual(normalizeLinks(undefined), []);
    assert.deepEqual(normalizeLinks(null), []);
    assert.deepEqual(normalizeLinks("nope"), []);
  });

  it("finds the first typed-but-invalid link, ignoring empty rows", () => {
    assert.equal(firstInvalidLink([{ label: "", url: "" }, { label: "x", url: "https://ok.com" }]), undefined);
    const bad = firstInvalidLink([{ label: "", url: "" }, { label: "y", url: "ftp://nope" }]);
    assert.deepEqual(bad, { label: "y", url: "ftp://nope" });
    assert.equal(firstInvalidLink(undefined), undefined);
  });
});
