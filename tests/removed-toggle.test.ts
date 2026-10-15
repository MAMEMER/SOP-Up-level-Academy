import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hooks = registerHooks({ load(url, context, next) {
  if (!url.endsWith("/components/RemovedRecords.tsx")) return next(url, context);
  const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText;
  return { format: "module", source, shortCircuit: true };
} });
const { RemovedToggle, RemovalNote } = await import("../components/RemovedRecords.tsx");
hooks.deregister();
test("toggle exposes a labelled checkbox and forwards both on and off to the list state", () => {
  let checked = false;
  const render = () => RemovedToggle({ checked, onChange: (value: boolean) => { checked = value; } });
  const input = () => React.Children.toArray(render().props.children)[0] as React.ReactElement<{ checked: boolean; onChange: (event: { target: { checked: boolean } }) => void }>;
  assert.equal(input().props.checked, false);
  assert.match(renderToStaticMarkup(render()), /แสดงรายการที่เอาชื่อออก/);
  input().props.onChange({ target: { checked: true } });
  assert.equal(input().props.checked, true);
  input().props.onChange({ target: { checked: false } });
  assert.equal(input().props.checked, false);
});
test("removal audit is absent on active/restored rows and safely escapes staff-entered reason", () => {
  assert.equal(RemovalNote({ record: {} }), null);
  assert.equal(RemovalNote({ record: { removed: false } }), null);
  const html = renderToStaticMarkup(RemovalNote({ record: { removed: true, removedBy: "UP-001", removedAt: "2026-10-15", removedReason: "<script>bad</script>" } }));
  assert.match(html, /UP-001/);
  assert.match(html, /2026-10-15/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
