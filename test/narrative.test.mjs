import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseFragment, render, loadFragments, createFragment, summariseDecision, install, SCAFFOLD } from "../bin/narrative.mjs";
import { parseNarrativeEvidence } from "../action/pr-evidence.mjs";

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

test("breaks a same-day tie by sequence rather than alphabetic filename", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-"));
  const fragments = join(root, "entries");
  mkdirSync(fragments);
  // "remodel-treasury" merged first but sorts after "migrate-the-model" alphabetically; only the
  // sequence timestamp can put them back in true merge order.
  writeFileSync(join(fragments, "20260727-migrate-the-model.md"), valid
    .replace("date: 2026-07-21", "date: 2026-07-27\nsequence: 2026-07-27T18:51:30Z")
    .replace("slug: choose-a-queue", "slug: migrate-the-model"));
  writeFileSync(join(fragments, "20260727-remodel-treasury.md"), valid
    .replace("date: 2026-07-21", "date: 2026-07-27\nsequence: 2026-07-27T10:15:00Z")
    .replace("slug: choose-a-queue", "slug: remodel-treasury"));
  const config = { fragments, preamble: join(root, "missing.md"), output: join(root, "Narrative.md"), title: "Test", summaryMaxCharacters: 240 };
  const loaded = loadFragments(config);
  assert.deepEqual(loaded.map((fragment) => fragment.slug), ["remodel-treasury", "migrate-the-model"]);
});

test("falls back to filename order when no fragment on the tied date carries a sequence", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-"));
  const fragments = join(root, "entries");
  mkdirSync(fragments);
  writeFileSync(join(fragments, "20260727-b-second.md"), valid
    .replace("date: 2026-07-21", "date: 2026-07-27").replace("slug: choose-a-queue", "slug: b-second"));
  writeFileSync(join(fragments, "20260727-a-first.md"), valid
    .replace("date: 2026-07-21", "date: 2026-07-27").replace("slug: choose-a-queue", "slug: a-first"));
  const config = { fragments, preamble: join(root, "missing.md"), output: join(root, "Narrative.md"), title: "Test", summaryMaxCharacters: 240 };
  const loaded = loadFragments(config);
  assert.deepEqual(loaded.map((fragment) => fragment.slug), ["a-first", "b-second"]);
});

test("rejects a malformed sequence and never renders the field", () => {
  assert.throws(
    () => parseFragment("20260721-choose-a-queue.md", valid.replace("status: proposed", "status: proposed\nsequence: 2026-07-21")),
    /sequence must be a UTC instant/,
  );
  const root = mkdtempSync(join(tmpdir(), "narrative-"));
  const fragments = join(root, "entries");
  mkdirSync(fragments);
  writeFileSync(join(fragments, "20260721-choose-a-queue.md"), valid.replace("status: proposed", "status: proposed\nsequence: 2026-07-21T09:30:00Z"));
  const config = { fragments, preamble: join(root, "missing.md"), output: join(root, "Narrative.md"), title: "Test", summaryMaxCharacters: 240 };
  const output = render(config, loadFragments(config));
  // "sequence" alone would also match "Con[sequence]s" in the rendered Consequences heading.
  assert.doesNotMatch(output, /sequence:/i);
  assert.doesNotMatch(output, /\b2026-07-21T09:30:00Z\b/);
});

test("createFragment writes a valid sequence and rejects a malformed one", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-"));
  const config = { fragments: join(root, "entries"), summaryMaxCharacters: 240 };
  const entry = { date: "2026-07-27", slug: "with-sequence", title: "With sequence", summary: "Summary", kind: "product", context: "Context", decision: "Decision", consequences: "Consequences", sequence: "2026-07-27T18:51:30Z" };
  const path = createFragment(config, entry);
  assert.match(readFileSync(path, "utf8"), /sequence: 2026-07-27T18:51:30Z/);
  assert.throws(() => createFragment(config, { ...entry, slug: "bad-sequence", sequence: "not-a-timestamp" }), /sequence must be a UTC instant/);
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

test("uses the last complete sentence within the summary limit", () => {
  const decision = "Enable the welcome message. Use the existing feature-flag artifact because this intentionally long second sentence exceeds the configured summary limit.";
  assert.equal(summariseDecision(decision, 80), "Enable the welcome message.");
});

test("falls back to a word-safe ellipsis when no complete sentence fits", () => {
  assert.equal(summariseDecision("A deliberately long sentence with no early punctuation", 31), "A deliberately long sentence…");
});

function narrativeBody(kind = "architecture") {
  return `## Narrative Kind

${kind}

## Narrative Context

Context.

## Narrative Decision

Decision.

## Narrative Consequences

Consequences.
`;
}

test("preserves every explicit canonical Narrative Kind", () => {
  for (const kind of ["product", "architecture", "governance", "operational", "correction", "experiment"]) {
    assert.equal(parseNarrativeEvidence(narrativeBody(kind)).kind, kind);
  }
});

test("rejects missing, empty, duplicate, unsupported, and non-canonical Narrative Kind evidence", () => {
  assert.throws(() => parseNarrativeEvidence(narrativeBody().replace("## Narrative Kind\n\narchitecture\n\n", "")), /exact ## Narrative Kind/);
  assert.throws(() => parseNarrativeEvidence(narrativeBody("")), /must contain exactly one canonical value/);
  assert.throws(() => parseNarrativeEvidence(`${narrativeBody("product")}\n## Narrative Kind\n\narchitecture\n`), /exactly one/);
  assert.throws(() => parseNarrativeEvidence(narrativeBody("domain")), /Unsupported Narrative Kind/);
  assert.throws(() => parseNarrativeEvidence(narrativeBody("Product")), /Unsupported Narrative Kind/);
});

function runAction(root, pullRequest) {
  const eventPath = join(root, "event.json");
  writeFileSync(eventPath, JSON.stringify({ pull_request: pullRequest, repository: { default_branch: "main" } }));
  return spawnSync(process.execPath, [resolve("action/github-action.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      INPUT_GITHUB_TOKEN: "test-token",
      INPUT_CONFIG: ".project-narrative.json",
      INPUT_REQUIRED_LABEL: "narrative-required",
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: "example/project",
    },
  });
}

test("unmerged and unlabelled pull requests leave no narrative side effects", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-action-skip-"));
  const base = { number: 1, title: "Decision", body: narrativeBody(), labels: [], merged_at: "2026-08-26T10:00:00Z" };
  const unmerged = runAction(root, { ...base, merged: false });
  assert.equal(unmerged.status, 0, unmerged.stderr);
  const unlabelled = runAction(root, { ...base, merged: true });
  assert.equal(unlabelled.status, 0, unlabelled.stderr);
  assert.ok(!existsSync(join(root, "narrative")));
  assert.ok(!existsSync(join(root, "Narrative.md")));
});

test("invalid Narrative Kind fails before fragment or proposal side effects", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-action-invalid-kind-"));
  const result = runAction(root, {
    number: 1,
    title: "Decision",
    body: narrativeBody("Product"),
    labels: [{ name: "narrative-required" }],
    merged: true,
    merged_at: "2026-08-26T10:00:00Z",
    html_url: "https://example.test/pull/1",
    merge_commit_sha: "abc123",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported Narrative Kind/);
  assert.ok(!existsSync(join(root, "narrative")));
  assert.ok(!existsSync(join(root, "Narrative.md")));
});

test("install scaffolds workflows, template, and the compiled document without overwriting", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-install-"));
  const previous = process.cwd();
  process.chdir(root);
  try {
    const first = install();
    for (const path of Object.keys(SCAFFOLD)) assert.ok(existsSync(path), `missing ${path}`);
    assert.ok(existsSync("Narrative.md"));
    assert.deepEqual(first.created.sort(), Object.keys(SCAFFOLD).sort());
    assert.deepEqual(first.skipped, []);
    assert.ok(first.followUps.some((step) => /narrative-required/.test(step)));

    writeFileSync(".github/pull_request_template.md", "custom template");
    const second = install();
    assert.ok(second.skipped.includes(".github/pull_request_template.md"));
    assert.equal(readFileSync(".github/pull_request_template.md", "utf8"), "custom template");
  } finally {
    process.chdir(previous);
  }
});

test("the scaffolded PR template requires an explicit canonical Narrative Kind", () => {
  const template = SCAFFOLD[".github/pull_request_template.md"];
  assert.match(template, /## Narrative Kind/);
  for (const kind of ["product", "architecture", "governance", "operational", "correction", "experiment"]) {
    assert.match(template, new RegExp(`\\b${kind}\\b`));
  }
});

test("scaffolded workflows reference the action and the required label", () => {
  const maintain = SCAFFOLD[".github/workflows/maintain-narrative.yml"];
  assert.match(maintain, /uses: jamiemitchellconsultants\/Narrative@/);
  assert.match(maintain, /required-label: narrative-required/);
  assert.match(SCAFFOLD[".github/workflows/validate-narrative.yml"], /mode: check/);
});

test("runs the CLI through an npm-style executable symlink", (t) => {
  const root = mkdtempSync(join(tmpdir(), "narrative-cli-"));
  const bin = join(root, "node_modules", ".bin");
  const project = join(root, "project");
  mkdirSync(bin, { recursive: true });
  mkdirSync(project);
  const link = join(bin, "narrative");
  try {
    symlinkSync(resolve("bin/narrative.mjs"), link);
  } catch (error) {
    if (error.code === "EPERM") return t.skip("creating symlinks requires Windows Developer Mode or elevated permission");
    throw error;
  }
  const result = spawnSync(process.execPath, [link, "init"], { cwd: project, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /narrative init: OK/);
  assert.match(readFileSync(join(project, "Narrative.md"), "utf8"), /GENERATED BY PROJECT NARRATIVE/);
});
