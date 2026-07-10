# Performance Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a calculation-first employee performance score page with auditable 100-point KPI scoring.

**Architecture:** Add a pure TypeScript scoring engine in `lib/performance-score.ts`, fixture/mock data in `lib/performance-score-data.ts`, and a server-rendered admin page at `/admin/performance-score`. Tests cover the score rules before UI wiring.

**Tech Stack:** Next.js App Router, React server components, TypeScript, Node test runner.

---

### Task 1: Scoring Engine

**Files:**
- Create: `lib/performance-score.ts`
- Test: `tests/performance-score.test.ts`

- [ ] Write failing tests for attendance, stock, checklist, service, assigned work, and incentive tiers.
- [ ] Run `npm test -- tests/performance-score.test.ts` and verify the missing module failure.
- [ ] Implement minimal exported types and scoring functions in `lib/performance-score.ts`.
- [ ] Run `npm test -- tests/performance-score.test.ts` and verify the score tests pass.

### Task 2: Mock/Import-Ready Data

**Files:**
- Create: `lib/performance-score-data.ts`
- Test: `tests/performance-score.test.ts`

- [ ] Add a test that calculates a full employee score from fixture records.
- [ ] Run the focused test and verify it fails before fixtures exist.
- [ ] Add period definitions and employee mock records for Google Sheet schedule, StoreHub attendance, StoreHub stock, checklist, service, and assigned work.
- [ ] Run the focused test and verify it passes.

### Task 3: Admin Page

**Files:**
- Create: `app/(dashboard)/admin/performance-score/page.tsx`
- Modify: `components/AppShell.tsx`
- Modify: `app/globals.css`

- [ ] Add admin page rendering period selector, summary cards, score table, deduction details, and source status.
- [ ] Add sidebar link labeled `Performance Score`.
- [ ] Add compact CSS classes for the performance score page.
- [ ] Run `npm run lint` to verify TypeScript.

### Task 4: Preview Verification

**Files:**
- No source file changes expected.

- [ ] Start or reuse the Next dev server.
- [ ] Verify `/admin/performance-score` returns a page response.
- [ ] Run `npm test -- tests/performance-score.test.ts`.
- [ ] Run `npm run lint`.
