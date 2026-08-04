import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTeamOptions, isTeamSelected, toggleTeamSelection } from "../lib/team-options.ts";

const ROSTER = [
  { code: "ICE", branch: "bangkae" },
  { code: "Boom", branch: "bangkae" },
  { code: "Leo", branch: "bangkae" },
  { code: "Nan", branch: "senafest" }
];

describe("buildTeamOptions", () => {
  it("exposes Team Bangkae and Team Sena fest with members grouped by branch", () => {
    const teams = buildTeamOptions(ROSTER);
    const bangkae = teams.find((t) => t.key === "bangkae");
    const sena = teams.find((t) => t.key === "senafest");
    assert.equal(bangkae?.label, "Team Bangkae");
    assert.deepEqual(bangkae?.memberCodes, ["ICE", "Boom", "Leo"]);
    assert.equal(sena?.label, "Team Sena fest");
    assert.deepEqual(sena?.memberCodes, ["Nan"]);
  });

  it("returns an empty member list for a team with no roster members", () => {
    const teams = buildTeamOptions([{ code: "ICE", branch: "bangkae" }]);
    assert.deepEqual(teams.find((t) => t.key === "senafest")?.memberCodes, []);
  });
});

describe("toggleTeamSelection", () => {
  it("adds every team member to the selection, keeping individual picks", () => {
    const next = toggleTeamSelection(["Wipop"], ["ICE", "Boom"]);
    assert.deepEqual(new Set(next), new Set(["Wipop", "ICE", "Boom"]));
  });

  it("removes the team when all members are already selected", () => {
    const next = toggleTeamSelection(["ICE", "Boom", "Wipop"], ["ICE", "Boom"]);
    assert.deepEqual(next, ["Wipop"]);
  });

  it("adds only the missing members when the team is partially selected", () => {
    const next = toggleTeamSelection(["ICE"], ["ICE", "Boom"]);
    assert.deepEqual(new Set(next), new Set(["ICE", "Boom"]));
  });

  it("is a no-op for an empty team (does not clobber the selection)", () => {
    assert.deepEqual(toggleTeamSelection(["ICE"], []), ["ICE"]);
  });
});

describe("isTeamSelected", () => {
  it("is true only when every member is present", () => {
    assert.equal(isTeamSelected(["ICE", "Boom"], ["ICE", "Boom"]), true);
    assert.equal(isTeamSelected(["ICE"], ["ICE", "Boom"]), false);
  });

  it("is false for an empty team", () => {
    assert.equal(isTeamSelected(["ICE"], []), false);
  });
});
