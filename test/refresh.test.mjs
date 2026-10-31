import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { refreshBranch, selectProposals } from "../action/refresh.mjs";

const cli = resolve("bin/narrative.mjs");

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

const git = (cwd, ...args) => run(cwd, "git", args);
const narrative = (cwd, command) => run(cwd, process.execPath, [cli, command]);

function refreshAction(work, eventName, payload, pulls = []) {
  const scratch = mkdtempSync(join(tmpdir(), "narrative-refresh-event-"));
  const event = join(scratch, "event.json");
  const api = join(scratch, "api.mjs");
  writeFileSync(event, JSON.stringify({ repository: { default_branch: "main" }, ...payload }));
  // Only the remote API is replaced: the runner, Git operations, compilation and push are real.
  writeFileSync(api, `globalThis.fetch = async (url) => {
    if (url !== "https://api.github.com/repos/owner/app/pulls?state=open&base=main&per_page=100&page=1")
      throw new Error("Unexpected API request: " + url);
    return { ok: true, json: async () => JSON.parse(process.env.TEST_REFRESH_PULLS) };
  };`);
  return spawnSync(process.execPath, ["--import", api, resolve("action/github-refresh.mjs")], {
    cwd: work, encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: eventName,
      GITHUB_REPOSITORY: "owner/app", INPUT_GITHUB_TOKEN: "test-fixture",
      TEST_REFRESH_PULLS: JSON.stringify(pulls) },
  });
}

function fragment(slug, date, decision = `Choose ${slug}.`) {
  return `---
date: ${date}
slug: ${slug}
title: "Choose ${slug}"
summary: "${decision}"
kind: architecture
status: accepted
---

## Context

A decision about ${slug} was needed.

## Decision

${decision}

## Consequences

${slug} is now fixed.
`;
}

function commitAll(cwd, message) {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

// Mirrors the observed failure: a proposal branch is cut from main, then main gains another
// entry, so both sides regenerate the compiled projection and it collides.
function scenario() {
  const root = mkdtempSync(join(tmpdir(), "narrative-refresh-"));
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  run(root, "git", ["init", "-q", "--bare", "-b", "main", origin]);
  run(root, "git", ["clone", "-q", origin, work]);
  git(work, "config", "user.name", "test");
  git(work, "config", "user.email", "test@example.com");
  git(work, "switch", "-q", "-c", "main");
  narrative(work, "init");
  writeFileSync(join(work, "README.md"), "readme\n");
  commitAll(work, "init");
  git(work, "push", "-q", "origin", "main");
  return { root, origin, work };
}

function addEntry(work, file, slug, date) {
  mkdirSync(join(work, "narrative/entries"), { recursive: true });
  writeFileSync(join(work, "narrative/entries", file), fragment(slug, date));
  narrative(work, "compile");
  commitAll(work, `add ${slug}`);
}

function proposal(work, number, file, slug, date) {
  const branch = `automation/narrative-pr-${number}`;
  git(work, "switch", "-q", "-c", branch, "main");
  addEntry(work, file, slug, date);
  git(work, "push", "-q", "origin", branch);
  git(work, "switch", "-q", "main");
  return branch;
}

function advanceMain(work, change) {
  git(work, "switch", "-q", "main");
  change();
  git(work, "push", "-q", "origin", "main");
  git(work, "fetch", "-q", "origin");
}

test("recompiles a proposal whose only conflict is the compiled output", () => {
  const { work } = scenario();
  const branch = proposal(work, 10, "20260919-plan.md", "plan", "2026-09-19");
  advanceMain(work, () => addEntry(work, "20260919-design.md", "design", "2026-09-19"));

  const result = refreshBranch({ cwd: work, branch, base: "main" });

  assert.equal(result.outcome, "refreshed");
  assert.equal(git(work, "branch", "--show-current"), branch);
  assert.deepEqual(readdirSync(join(work, "narrative/entries")).sort(), ["20260919-design.md", "20260919-plan.md"]);
  narrative(work, "check");
  const compiled = readFileSync(join(work, "Narrative.md"), "utf8");
  assert.doesNotMatch(compiled, /^(<{7}|={7}|>{7})/m);
  assert.match(compiled, /Choose plan/);
  assert.match(compiled, /Choose design/);
  git(work, "merge-base", "--is-ancestor", "origin/main", "HEAD");
  assert.equal(git(work, "status", "--porcelain"), "");
});

test("leaves a proposal that already contains the base branch untouched", () => {
  const { work } = scenario();
  const branch = proposal(work, 10, "20260919-plan.md", "plan", "2026-09-19");
  git(work, "fetch", "-q", "origin");

  const result = refreshBranch({ cwd: work, branch, base: "main" });

  assert.equal(result.outcome, "current");
  assert.equal(git(work, "rev-parse", "HEAD"), git(work, "rev-parse", `origin/${branch}`));
});

test("does not rewrite a proposal when the base moved without touching the narrative", () => {
  const { work } = scenario();
  const branch = proposal(work, 10, "20260919-plan.md", "plan", "2026-09-19");
  advanceMain(work, () => {
    writeFileSync(join(work, "README.md"), "changed\n");
    commitAll(work, "unrelated");
  });

  const result = refreshBranch({ cwd: work, branch, base: "main" });

  assert.equal(result.outcome, "unaffected");
  assert.equal(git(work, "rev-parse", "HEAD"), git(work, "rev-parse", `origin/${branch}`));
  assert.equal(git(work, "status", "--porcelain"), "");
});

test("refuses to resolve a conflict in any file other than the compiled output", () => {
  const { work } = scenario();
  const branch = `automation/narrative-pr-10`;
  git(work, "switch", "-q", "-c", branch, "main");
  writeFileSync(join(work, "README.md"), "proposal side\n");
  addEntry(work, "20260919-plan.md", "plan", "2026-09-19");
  git(work, "push", "-q", "origin", branch);
  advanceMain(work, () => {
    writeFileSync(join(work, "README.md"), "main side\n");
    addEntry(work, "20260919-design.md", "design", "2026-09-19");
  });

  const result = refreshBranch({ cwd: work, branch, base: "main" });

  assert.equal(result.outcome, "blocked");
  assert.deepEqual(result.conflicts, ["README.md"]);
  assert.equal(git(work, "rev-parse", "HEAD"), git(work, "rev-parse", `origin/${branch}`));
  assert.equal(git(work, "status", "--porcelain"), "");
});

test("refuses to commit when the merged fragments are invalid", () => {
  const { work } = scenario();
  const branch = proposal(work, 10, "20260919-same-slug.md", "same-slug", "2026-09-19");
  advanceMain(work, () => addEntry(work, "20260920-same-slug.md", "same-slug", "2026-09-20"));

  const result = refreshBranch({ cwd: work, branch, base: "main" });

  assert.equal(result.outcome, "invalid");
  assert.match(result.detail, /slug/i);
  assert.equal(git(work, "rev-parse", "HEAD"), git(work, "rev-parse", `origin/${branch}`));
  assert.equal(git(work, "status", "--porcelain"), "");
});

test("treats a hostile branch name as data, never as a git option", () => {
  const { work } = scenario();
  assert.throws(() => refreshBranch({ cwd: work, branch: "--upload-pack=touch pwned", base: "main" }), /branch name/);
  assert.throws(() => refreshBranch({ cwd: work, branch: "automation/narrative-pr-1", base: "-x" }), /branch name/);
});

test("selects only open proposal branches from this repository", () => {
  const pull = (ref, repo = "owner/app") => ({ number: 1, head: { ref, repo: repo && { full_name: repo } } });
  const pulls = [
    pull("automation/narrative-pr-10"),
    pull("automation/narrative-pr-11", "fork/app"),
    pull("automation/narrative-pr-12", null),
    pull("automation/narrative-pr-x"),
    pull("feature/automation/narrative-pr-13"),
    pull("claude/some-feature"),
    pull("automation/narrative-pr-14"),
  ];
  assert.deepEqual(selectProposals(pulls, "owner/app").map((item) => item.head.ref),
    ["automation/narrative-pr-10", "automation/narrative-pr-14"]);
});

test("a successful maintenance completion repairs a proposal created after the push refresh", () => {
  const { work } = scenario();
  const oldBase = git(work, "rev-parse", "HEAD");
  advanceMain(work, () => addEntry(work, "20260919-design.md", "design", "2026-09-19"));
  const early = refreshAction(work, "push", { ref: "refs/heads/main" });
  assert.equal(early.status, 0, early.stderr);
  assert.match(early.stdout, /No open narrative proposals/);

  const branch = "automation/narrative-pr-10";
  git(work, "switch", "-q", "-c", branch, oldBase);
  addEntry(work, "20260919-plan.md", "plan", "2026-09-19");
  git(work, "push", "-q", "origin", branch);
  const result = refreshAction(work, "workflow_run", {
    action: "completed", workflow_run: { conclusion: "success" },
  }, [{ number: 10, head: { ref: branch, repo: { full_name: "owner/app" } } }]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /merged main and recompiled/);
  assert.deepEqual(readdirSync(join(work, "narrative/entries")).sort(), ["20260919-design.md", "20260919-plan.md"]);
  narrative(work, "check");
  git(work, "fetch", "-q", "origin");
  git(work, "merge-base", "--is-ancestor", "origin/main", `origin/${branch}`);
  assert.equal(git(work, "rev-parse", `origin/${branch}`), git(work, "rev-parse", "HEAD"));
});

test("manual refresh repairs an existing conflicted proposal", () => {
  const { work } = scenario();
  const branch = proposal(work, 10, "20260919-plan.md", "plan", "2026-09-19");
  advanceMain(work, () => addEntry(work, "20260919-design.md", "design", "2026-09-19"));
  const result = refreshAction(work, "workflow_dispatch", {},
    [{ number: 10, head: { ref: branch, repo: { full_name: "owner/app" } } }]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /merged main and recompiled/);
  narrative(work, "check");
  git(work, "fetch", "-q", "origin");
  git(work, "merge-base", "--is-ancestor", "origin/main", `origin/${branch}`);
});

test("unrelated or unsuccessful events leave proposal branches untouched", () => {
  const { work } = scenario();
  const branch = proposal(work, 10, "20260919-plan.md", "plan", "2026-09-19");
  advanceMain(work, () => addEntry(work, "20260919-design.md", "design", "2026-09-19"));
  const before = git(work, "rev-parse", `origin/${branch}`);
  for (const [name, payload] of [
    ["push", { ref: "refs/heads/feature" }],
    ["workflow_run", { action: "completed", workflow_run: { conclusion: "failure" } }],
    ["workflow_run", { action: "completed", workflow_run: { conclusion: "cancelled" } }],
    ["workflow_run", { action: "requested", workflow_run: { conclusion: "success" } }],
    ["pull_request", { ref: "refs/heads/main" }],
  ]) {
    const result = refreshAction(work, name, payload,
      [{ number: 10, head: { ref: branch, repo: { full_name: "owner/app" } } }]);
    assert.equal(result.status, 0, result.stderr);
    git(work, "fetch", "-q", "origin");
    assert.equal(git(work, "rev-parse", `origin/${branch}`), before, name);
  }
});
