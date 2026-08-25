import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseFragment, render, loadFragments, createFragment, summariseDecision, install, SCAFFOLD } from "../bin/narrative.mjs";
import { parseNarrativeEvidence } from "../action/github-action.mjs";

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

const narrativeBody = (kind = "product") => `## Narrative Kind

${kind}

## Narrative Context

Context.

## Narrative Decision

Decision.

## Narrative Consequences

Consequences.
`;

test("preserves every canonical Narrative Kind supplied in pull-request evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-kinds-"));
  const config = { fragments: join(root, "entries"), summaryMaxCharacters: 240 };
  for (const kind of ["product", "architecture", "governance", "operational", "correction", "experiment"]) {
    const narrative = parseNarrativeEvidence(narrativeBody(kind));
    assert.equal(narrative.kind, kind);
    const path = createFragment(config, {
      date: "2026-08-25", slug: `kind-${kind}`, title: kind, summary: "Summary", kind: narrative.kind,
      context: narrative.context, decision: narrative.decision, consequences: narrative.consequences,
    });
    assert.match(readFileSync(path, "utf8"), new RegExp(`kind: ${kind}`));
  }
});

test("rejects missing, empty, duplicate, unsupported, and non-canonical Narrative Kind evidence", () => {
  assert.throws(() => parseNarrativeEvidence(narrativeBody().replace("## Narrative Kind\n\nproduct\n\n", "")), /exactly one '## Narrative Kind'/);
  assert.throws(() => parseNarrativeEvidence(narrativeBody().replace("product", "")), /Narrative Kind' must be non-empty/);
  assert.throws(() => parseNarrativeEvidence(`${narrativeBody()}\n## Narrative Kind\n\narchitecture\n`), /exactly one '## Narrative Kind'/);
  assert.throws(() => parseNarrativeEvidence(narrativeBody("unknown")), /canonical value/);
  assert.throws(() => parseNarrativeEvidence(narrativeBody("Product")), /canonical value/);
});

function runAction(event) {
  const root = mkdtempSync(join(tmpdir(), "narrative-action-"));
  const eventPath = join(root, "event.json");
  writeFileSync(eventPath, JSON.stringify(event));
  const result = spawnSync(process.execPath, [resolve("action/github-action.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, INPUT_GITHUB_TOKEN: "test-token", GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "example/project" },
  });
  return { root, result };
}

function pullRequest(overrides = {}) {
  return {
    merged: true,
    number: 42,
    title: "Choose a queue",
    body: narrativeBody(),
    labels: [{ name: "narrative-required" }],
    merged_at: "2026-08-25T10:00:00Z",
    html_url: "https://github.com/example/project/pull/42",
    merge_commit_sha: "abc123",
    ...overrides,
  };
}

test("unmerged and unlabelled pull-request events retain no-side-effect behavior", () => {
  for (const pr of [pullRequest({ merged: false }), pullRequest({ labels: [] })]) {
    const { root, result } = runAction({ pull_request: pr });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, "narrative")), false);
    assert.equal(existsSync(join(root, "Narrative.md")), false);
  }
});

test("invalid Narrative Kind fails before fragment or proposal side effects", () => {
  const { root, result } = runAction({ pull_request: pullRequest({ body: narrativeBody("Product") }) });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Narrative Kind.*canonical value/);
  assert.equal(existsSync(join(root, "narrative")), false);
  assert.equal(existsSync(join(root, "Narrative.md")), false);
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
    const template = readFileSync(".github/pull_request_template.md", "utf8");
    for (const heading of ["Narrative Kind", "Narrative Context", "Narrative Decision", "Narrative Consequences"]) {
      assert.match(template, new RegExp(`## ${heading}`));
    }

    writeFileSync(".github/pull_request_template.md", "custom template");
    const second = install();
    assert.ok(second.skipped.includes(".github/pull_request_template.md"));
    assert.equal(readFileSync(".github/pull_request_template.md", "utf8"), "custom template");
  } finally {
    process.chdir(previous);
  }
});

test("scaffolded workflows reference the action and the required label", () => {
  const maintain = SCAFFOLD[".github/workflows/maintain-narrative.yml"];
  assert.match(maintain, /uses: jamiemitchellconsultants\/Narrative@/);
  assert.match(maintain, /required-label: narrative-required/);
  assert.match(SCAFFOLD[".github/workflows/validate-narrative.yml"], /mode: check/);
});

test("runs the CLI through an npm-style executable symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "narrative-cli-"));
  const bin = join(root, "node_modules", ".bin");
  const project = join(root, "project");
  mkdirSync(bin, { recursive: true });
  mkdirSync(project);
  const link = join(bin, "narrative");
  let executable = link;
  try {
    symlinkSync(resolve("bin/narrative.mjs"), link);
  } catch (error) {
    // Windows installations without Developer Mode can run Node but cannot create file symlinks.
    // Keep the entry-point assertion meaningful in that environment; Linux CI still exercises the
    // npm-style symlink path above.
    if (error.code !== "EPERM") throw error;
    executable = resolve("bin/narrative.mjs");
  }
  const result = spawnSync(process.execPath, [executable, "init"], { cwd: project, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /narrative init: OK/);
  assert.match(readFileSync(join(project, "Narrative.md"), "utf8"), /GENERATED BY PROJECT NARRATIVE/);
});
