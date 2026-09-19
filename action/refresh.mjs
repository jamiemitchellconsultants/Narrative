import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, normalize } from "node:path";
import { loadConfig } from "../bin/narrative.mjs";

const cli = fileURLToPath(new URL("../bin/narrative.mjs", import.meta.url));
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export const PROPOSAL_BRANCH_RE = /^automation\/narrative-pr-\d+$/;

/** Open pull requests whose head is one of this repository's own narrative proposal branches. */
export function selectProposals(pulls, repository) {
  return pulls.filter((pull) => PROPOSAL_BRANCH_RE.test(pull.head?.ref ?? "") && pull.head?.repo?.full_name === repository);
}

function exec(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

function git(cwd, ...args) {
  const result = exec(cwd, "git", args);
  if (!result.ok) throw new Error(`git ${args[0]} failed: ${result.output}`);
  return result.output;
}

function assertBranchName(name) {
  if (typeof name !== "string" || !BRANCH_RE.test(name) || name.includes("..")) {
    throw new Error(`refusing unsafe branch name ${JSON.stringify(name)}`);
  }
}

/**
 * Bring a narrative proposal branch up to date with its base, repairing the one conflict that is
 * always mechanical: the compiled output. Fragments have unique filenames and merge cleanly; the
 * compiled file is a projection of them, so it is discarded and recompiled, never hand-merged.
 *
 * Leaves `branch` checked out. On "refreshed" HEAD is a new merge commit ready to push; on every
 * other outcome HEAD equals `<remote>/<branch>` and the working tree is clean.
 *
 * Outcomes: "current" (already contains base), "unaffected" (base moved but the merged compiled
 * output is still fresh, so no rewrite is needed), "refreshed", "blocked" (a file other than the
 * compiled output conflicts; `conflicts` lists them), "invalid" (merged fragments fail validation;
 * `detail` says why).
 */
export function refreshBranch({ cwd, branch, base, remote = "origin", configPath = ".project-narrative.json" }) {
  assertBranchName(branch);
  assertBranchName(base);
  assertBranchName(remote);
  const output = normalize(loadConfig(join(cwd, configPath)).output);
  const head = `${remote}/${branch}`;
  const target = `${remote}/${base}`;

  git(cwd, "switch", "--quiet", "--force-create", branch, head);
  if (exec(cwd, "git", ["merge-base", "--is-ancestor", target, "HEAD"]).ok) return { outcome: "current" };

  const reset = (result) => {
    exec(cwd, "git", ["merge", "--abort"]);
    git(cwd, "reset", "--quiet", "--hard", head);
    return result;
  };
  const narrative = (command) => exec(cwd, process.execPath, [cli, command, "--config", configPath]);

  const merged = exec(cwd, "git", ["merge", "--no-ff", "--no-commit", "--no-edit", target]);
  if (!merged.ok) {
    const conflicts = git(cwd, "diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
    if (!conflicts.length) return reset({ outcome: "blocked", conflicts, detail: merged.output });
    const foreign = conflicts.filter((path) => normalize(path) !== output);
    if (foreign.length) return reset({ outcome: "blocked", conflicts: foreign });
  } else if (narrative("check").ok) {
    return reset({ outcome: "unaffected" });
  }

  const compiled = narrative("compile");
  if (!compiled.ok) return reset({ outcome: "invalid", detail: compiled.output });
  const checked = narrative("check");
  if (!checked.ok) return reset({ outcome: "invalid", detail: checked.output });

  git(cwd, "add", "--", output);
  git(cwd, "commit", "--quiet", "--no-edit", "-m", `docs: merge ${base} and recompile ${output}`);
  return { outcome: "refreshed" };
}
