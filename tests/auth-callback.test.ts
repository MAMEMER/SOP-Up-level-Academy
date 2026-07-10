import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("auth callback", () => {
  it("redirects signed-in users to the dashboard page", async () => {
    const routeSource = readFileSync("app/api/auth/callback/route.ts", "utf8");

    assert.match(routeSource, /new URL\("\/", request\.url\)/);
    assert.doesNotMatch(routeSource, /new URL\("\/checklist", request\.url\)/);
  });
});
