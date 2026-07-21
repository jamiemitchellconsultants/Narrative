import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFragment, render, loadFragments, createFragment } from "../bin/narrative.mjs";

const valid = `---
date: 2026-07-21
slug: choose-a-queue
title: "Choose a queue"
summary: "Use a managed queue."
kind: architecture
status: proposed
---

## Context

Delivery needs buffering.

## Decision

Use a managed queue.

## Consequences

Operations remain pay-per-use.
`;

test("parses a governed Context/Decision/Consequences fragment", () => {
  const fragment = parseFragment("20260721-choose-a-queue.md", valid);
  assert.equal(fragment.slug, "choose-a-queue");
  assert.equal(fragment.kind, "architecture");
});

test("rejects an entry without the required decision structure", () => {
  assert.throws(() => parseFragment("20260721-choose-a-queue.md", valid.replace("## Decision", "## Result")), /Context, ## Decision/);
});

test("sorts deterministically and renders durable slug anchors", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-"));
  const fragments = join(root, "entries");
  mkdirSync(fragments);
  writeFileSync(join(fragments, "20260721-choose-a-queue.md"), valid);
  const config = { fragments, preamble: join(root, "missing.md"), output: join(root, "Narrative.md"), title: "Test", summaryMaxCharacters: 240 };
  const loaded = loadFragments(config);
  const output = render(config, loaded);
  assert.match(output, /entry-choose-a-queue/);
  assert.match(output, /Use a managed queue\./);
});

test("makes repeated proposed slugs unique without corrupting metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-"));
  const config = { fragments: join(root, "entries"), summaryMaxCharacters: 240 };
  const entry = { date: "2026-07-21", slug: "same-decision", title: "Same", summary: "Same", kind: "product", context: "Context", decision: "Decision", consequences: "Consequences" };
  createFragment(config, entry);
  const second = createFragment(config, entry);
  assert.match(second, /same-decision-2\.md$/);
  assert.match(readFileSync(second, "utf8"), /slug: same-decision-2/);
});
