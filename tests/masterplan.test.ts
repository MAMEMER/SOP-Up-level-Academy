import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_DOC_BYTES,
  applyExactReplace,
  bangkokDate,
  buildAiContext,
  canDeleteProposal,
  canEditProposal,
  canTransition,
  checkDocSize,
  countOccurrences,
  findSectionIndex,
  formatCode,
  groupByMission,
  idFromCode,
  isOverdue,
  nextCodeNumber,
  normalizeMissions,
  ownerFromHint,
  parseAiReply,
  parseTaskImport,
  planTaskImport,
  replaceSectionBody,
  sectionWithChildren,
  splitSections,
  validateProposalDraft,
  validateTaskDraft
} from "../lib/masterplan.ts";
import { docSectionViews, renderMarkdown } from "../lib/masterplan-markdown.ts";

// Dummy text only — the repo is public; real Masterplan content never goes in git.
const DOC = `Intro line.

# Alpha
alpha body
more alpha

## Alpha child
child body

# Beta
beta body
\`\`\`
# not a heading inside a fence
\`\`\`
`;

describe("codes", () => {
  it("formats and numbers sequentially", () => {
    assert.equal(formatCode("P", 1), "P-001");
    assert.equal(formatCode("P", 42), "P-042");
    assert.equal(formatCode("T", 1234), "T-1234");
    assert.equal(nextCodeNumber([], "P"), 1);
    assert.equal(nextCodeNumber(["P-001", "P-009", "P-003", "T-050", "X1"], "P"), 10);
  });
  it("makes slash-free ids", () => {
    assert.equal(idFromCode("P-001"), "P-001");
    assert.equal(idFromCode("a/b c"), "a-b-c");
  });
  it("bangkokDate uses +07:00", () => {
    assert.equal(bangkokDate(new Date("2026-10-27T16:59:00Z")), "2026-10-27");
    assert.equal(bangkokDate(new Date("2026-10-27T17:00:00Z")), "2026-10-28");
  });
});

describe("validation", () => {
  const base = { title: "Dummy", missions: ["A"], location: "Alpha", kind: "แก้", oldText: "alpha body", newText: "new body", reason: "why" };
  it("accepts a good draft", () => {
    const out = validateProposalDraft(base);
    assert.equal(out.ok, true);
  });
  it("needs title, kind, mission", () => {
    assert.equal(validateProposalDraft({ ...base, title: " " }).ok, false);
    assert.equal(validateProposalDraft({ ...base, kind: "x" }).ok, false);
    assert.equal(validateProposalDraft({ ...base, missions: [] }).ok, false);
  });
  it("แก้/ลบ need oldText; แก้/เพิ่ม need newText; คำถาม needs neither", () => {
    assert.equal(validateProposalDraft({ ...base, oldText: "" }).ok, false);
    assert.equal(validateProposalDraft({ ...base, kind: "เพิ่ม", oldText: "", newText: "" }).ok, false);
    assert.equal(validateProposalDraft({ ...base, kind: "ลบ", newText: "" }).ok, true);
    assert.equal(validateProposalDraft({ ...base, kind: "คำถาม", oldText: "", newText: "" }).ok, true);
  });
  it("normalizes missions", () => {
    assert.deepEqual(normalizeMissions(["a", "Mission B", "ภาพรวม", "A", "zzz"]), ["A", "B", "ภาพรวม"]);
    assert.deepEqual(normalizeMissions("C, D"), ["C", "D"]);
  });
  it("tasks", () => {
    assert.equal(validateTaskDraft({ title: "t" }, ["champ"]).ok, true);
    assert.equal(validateTaskDraft({ title: "t", owner: "evil" }, ["champ"]).ok, false);
    assert.equal(validateTaskDraft({ title: "t", due: "2026-02-30" }, ["champ"]).ok, false);
    assert.equal(validateTaskDraft({ title: "t", status: "??" }, ["champ"]).ok, false);
  });
  it("refuses docs near the Firestore 1 MiB limit", () => {
    assert.equal(checkDocSize("x".repeat(1000)).ok, true);
    assert.equal(checkDocSize("x".repeat(MAX_DOC_BYTES + 1)).ok, false);
    // Thai is 3 bytes per char in UTF-8
    assert.equal(checkDocSize("ก".repeat(Math.ceil(MAX_DOC_BYTES / 3) + 1)).ok, false);
  });
});

describe("status transitions", () => {
  const champ = { key: "champ", editor: true };
  const name = { key: "name", editor: false };
  const mine = (status: string) => ({ status, proposer: "name" }) as never;
  it("proposer moves ร่าง ↔ รอคุย; others can't", () => {
    assert.equal(canTransition(mine("ร่าง"), "รอคุย", name), true);
    assert.equal(canTransition(mine("ร่าง"), "รอคุย", champ), false);
    assert.equal(canTransition(mine("รอคุย"), "ร่าง", name), true);
  });
  it("anyone decides on รอคุย, and can undo back", () => {
    for (const verdict of ["ลง", "ไม่ลง", "พักไว้"] as const) assert.equal(canTransition(mine("รอคุย"), verdict, champ), true);
    assert.equal(canTransition(mine("ร่าง"), "ลง", champ), false);
    assert.equal(canTransition(mine("ลง"), "รอคุย", name), true);
    assert.equal(canTransition(mine("พักไว้"), "รอคุย", champ), true);
  });
  it("only editors reach ลงแล้ว, and only from ลง", () => {
    assert.equal(canTransition(mine("ลง"), "ลงแล้ว", name), false);
    assert.equal(canTransition(mine("ลง"), "ลงแล้ว", champ), true);
    assert.equal(canTransition(mine("รอคุย"), "ลงแล้ว", champ), false);
    assert.equal(canTransition(mine("ลงแล้ว"), "รอคุย", champ), false);
  });
  it("edit/delete rights", () => {
    assert.equal(canEditProposal(mine("ร่าง"), name), true);
    assert.equal(canEditProposal(mine("รอคุย"), name), true);
    assert.equal(canEditProposal(mine("ลง"), name), false);
    assert.equal(canEditProposal(mine("ร่าง"), champ), false);
    assert.equal(canDeleteProposal(mine("ร่าง"), name), true);
    assert.equal(canDeleteProposal(mine("รอคุย"), name), false);
  });
  it("groups by primary mission in MISSIONS order", () => {
    const groups = groupByMission([{ missions: ["B"] }, { missions: [] }, { missions: ["A", "B"] }] as never[]);
    assert.deepEqual(groups.map((g) => [g.mission, g.items.length]), [["ภาพรวม", 1], ["A", 1], ["B", 1]]);
  });
});

describe("markdown sections", () => {
  it("splits at headings, ignoring fenced code, bodies are exact substrings", () => {
    const sections = splitSections(DOC);
    assert.deepEqual(sections.map((s) => [s.index, s.level, s.heading]), [[0, 0, ""], [1, 1, "Alpha"], [2, 2, "Alpha child"], [3, 1, "Beta"]]);
    assert.equal(sections[0].body, "Intro line.\n\n");
    assert.equal(sections[1].body, "alpha body\nmore alpha\n\n");
    for (const s of sections) assert.equal(DOC.slice(s.bodyStart, s.end), s.body);
    assert.ok(sections[3].body.includes("# not a heading"));
  });
  it("sectionWithChildren includes sub-sections", () => {
    const text = sectionWithChildren(DOC, 1);
    assert.ok(text.startsWith("# Alpha"));
    assert.ok(text.includes("child body"));
    assert.ok(!text.includes("beta body"));
  });
  it("replaceSectionBody checks the base and keeps the rest", () => {
    const out = replaceSectionBody(DOC, 2, "child body\n\n", "new child");
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.ok(out.value.includes("## Alpha child\nnew child\n\n# Beta"));
      assert.ok(out.value.startsWith("Intro line."));
    }
    assert.equal(replaceSectionBody(DOC, 2, "stale", "x").ok, false);
    assert.equal(replaceSectionBody(DOC, 99, "", "x").ok, false);
  });
  it("applyExactReplace only when the old text occurs once", () => {
    assert.equal(countOccurrences("a b a", "a"), 2);
    assert.equal(countOccurrences("abc", ""), 0);
    const ok = applyExactReplace(DOC, "more alpha", "MORE");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.ok(ok.value.includes("alpha body\nMORE\n"));
    assert.equal(applyExactReplace(DOC, "body", "x").ok, false); // many
    assert.equal(applyExactReplace(DOC, "missing", "x").ok, false);
  });
  it("findSectionIndex by heading, then by old text", () => {
    assert.equal(findSectionIndex(DOC, "Beta", ""), 3);
    assert.equal(findSectionIndex(DOC, "## Alpha child", ""), 2);
    assert.equal(findSectionIndex(DOC, "", "child body"), 2);
  });
});

describe("markdown renderer", () => {
  it("renders a GFM table inside a scroll wrapper", () => {
    const html = renderMarkdown("| KPI | Target |\n|---|--:|\n| Dummy one | 10 |\n| Dummy two | 20 |");
    assert.ok(html.startsWith('<div class="mp-table-wrap"'));
    assert.ok(html.includes("<th>KPI</th>"));
    assert.ok(html.includes('<td style="text-align:right">20</td>'));
  });
  it("escapes HTML and drops unsafe links", () => {
    const html = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://example.com)');
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes('href="javascript'));
    assert.ok(html.includes('href="https://example.com"'));
  });
  it("lists, emphasis, code, quote", () => {
    const html = renderMarkdown("- one **bold**\n- two `code`\n  - nested\n\n> quote\n\n1. first");
    assert.ok(html.includes("<ul><li>one <strong>bold</strong></li>"));
    assert.ok(html.includes("<code>code</code>"));
    assert.ok(html.includes("<ul><li>nested</li></ul>"));
    assert.ok(html.includes("<blockquote>"));
    assert.ok(html.includes("<ol><li>first</li></ol>"));
  });
  it("docSectionViews gives one view per section", () => {
    const views = docSectionViews(DOC);
    assert.equal(views.length, 4);
    assert.equal(views[1].heading, "Alpha");
    assert.ok(views[1].html.includes("<p>alpha body"));
  });
});

describe("AI copy / paste", () => {
  it("builds one block with instructions, content, and the reply schema", () => {
    const text = buildAiContext({
      memberName: "เนม",
      scopeLabel: "ทั้งฉบับกลาง",
      docText: "dummy doc",
      scratch: "dummy note",
      openProposals: [{ code: "P-001", title: "dummy", status: "รอคุย", location: "", kind: "แก้", newText: "" }]
    });
    assert.ok(text.includes('"เนม"'));
    assert.ok(text.includes("ห้ามแต่งตัวเลขเป้าหมาย"));
    assert.ok(text.includes("dummy doc"));
    assert.ok(text.includes("dummy note"));
    assert.ok(text.includes("P-001"));
    assert.ok(text.includes("```json"));
    assert.ok(text.includes('"oldText"'));
  });
  it("parses a fenced json reply", () => {
    const reply = 'คำอธิบาย\n```json\n[{"title":"T1","missions":["A"],"location":"Alpha","kind":"แก้","oldText":"a","newText":"b","reason":"r"}]\n```\nจบ';
    const out = parseAiReply(reply);
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.length, 1);
      assert.equal(out.value[0].valid, true);
      assert.equal(out.value[0].title, "T1");
    }
  });
  it("tolerates smart quotes, trailing commas, and no fence", () => {
    const reply = "นี่คือข้อเสนอ: [{“title”: “T2”, “missions”: [“B”,], “kind”: “เพิ่ม”, “newText”: “new”,},]";
    const out = parseAiReply(reply);
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value[0].title, "T2");
      assert.deepEqual(out.value[0].missions, ["B"]);
      assert.equal(out.value[0].valid, true);
    }
  });
  it("accepts a lone object or {proposals:[…]}, defaults missing missions to ภาพรวม", () => {
    const one = parseAiReply('{"title":"Solo","kind":"คำถาม","newText":"?"}');
    assert.equal(one.ok && one.value[0].missions[0], "ภาพรวม");
    const wrapped = parseAiReply('{"proposals":[{"title":"W","kind":"คำถาม"}]}');
    assert.equal(wrapped.ok && wrapped.value[0].title, "W");
  });
  it("marks invalid items instead of failing the whole reply", () => {
    const out = parseAiReply('[{"title":"ok","kind":"แก้","missions":["A"],"oldText":"x","newText":"y"},{"title":"","kind":"แก้"}]');
    assert.equal(out.ok, true);
    if (out.ok) assert.deepEqual(out.value.map((i) => i.valid), [true, false]);
  });
  it("explains when nothing parses", () => {
    const out = parseAiReply("ไม่มี json เลย");
    assert.equal(out.ok, false);
    if (!out.ok) assert.ok(out.error.includes("JSON"));
    assert.equal(parseAiReply("").ok, false);
    assert.equal(parseAiReply("[]").ok, false);
  });
});

describe("task import", () => {
  it("parses rows, maps owner hints, skips bad rows and dupes", () => {
    const out = parseTaskImport(
      JSON.stringify([
        { code: "X-1", title: "Dummy 1", mission: "A", due: "2026-11-01", ownerHint: "เนม" },
        { code: "X-2", title: "Dummy 2", mission: ["B", "C"], due: "soon", ownerHint: "Top" },
        { code: "", title: "no code" },
        { code: "X-1", title: "dupe" }
      ])
    );
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.value.rows.length, 2);
      assert.equal(out.value.rows[0].owner, "name");
      assert.equal(out.value.rows[0].due, "2026-11-01");
      assert.equal(out.value.rows[1].owner, "top");
      assert.equal(out.value.rows[1].due, null);
      assert.deepEqual(out.value.rows[1].missions, ["B", "C"]);
      assert.equal(out.value.skipped.length, 2);
    }
    assert.equal(parseTaskImport("{}").ok, false);
  });
  it("is idempotent by code", () => {
    const rows = [{ code: "X-1" }, { code: "X-2" }] as never[];
    const plan = planTaskImport(rows, ["X-1"]);
    assert.deepEqual(plan.existing, ["X-1"]);
    assert.equal(plan.create.length, 1);
    assert.equal(planTaskImport(rows, ["X-1", "X-2"]).create.length, 0);
  });
  it("owner hints don't match inside other words", () => {
    assert.equal(ownerFromHint("stop"), null);
    assert.equal(ownerFromHint("username"), null);
    assert.equal(ownerFromHint("แชมป์+เนม"), "champ");
    assert.equal(ownerFromHint(""), null);
  });
  it("overdue = past due and not done/paused", () => {
    assert.equal(isOverdue({ due: "2026-10-01", status: "กำลังทำ" }, "2026-10-27"), true);
    assert.equal(isOverdue({ due: "2026-10-01", status: "เสร็จ" }, "2026-10-27"), false);
    assert.equal(isOverdue({ due: "2026-10-27", status: "กำลังทำ" }, "2026-10-27"), false);
    assert.equal(isOverdue({ due: null, status: "กำลังทำ" }, "2026-10-27"), false);
  });
});
