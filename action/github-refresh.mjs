import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { refreshBranch, selectProposals } from "./refresh.mjs";

const token = process.env.INPUT_GITHUB_TOKEN;
const configPath = process.env.INPUT_CONFIG || ".project-narrative.json";
const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY;
const apiUrl = process.env.GITHUB_API_URL || "https://api.github.com";

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function request(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) fail(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}

if (!token || !eventPath || !repository) fail("github-token, GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required");
const event = JSON.parse(readFileSync(eventPath, "utf8"));
const base = event.repository?.default_branch;
if (!base || event.ref !== `refs/heads/${base}`) {
  console.log("Not a push to the default branch; no narrative proposals to refresh.");
  process.exit(0);
}

const [owner, repo] = repository.split("/");
const pulls = [];
for (let page = 1; ; page += 1) {
  const batch = await request(`/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100&page=${page}`);
  pulls.push(...batch);
  if (batch.length < 100) break;
}
const proposals = selectProposals(pulls, repository);
if (!proposals.length) {
  console.log("No open narrative proposals to refresh.");
  process.exit(0);
}

execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
execFileSync("git", ["fetch", "--quiet", "origin"], { stdio: "inherit" });

let failed = false;
for (const pull of proposals) {
  const branch = pull.head.ref;
  const result = refreshBranch({ cwd: process.cwd(), branch, base, configPath });
  if (result.outcome === "refreshed") {
    // Never force: if the branch moved since it was fetched, leave it for the next run.
    const pushed = spawnSync("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { encoding: "utf8" });
    if (pushed.status === 0) console.log(`#${pull.number} ${branch}: merged ${base} and recompiled the narrative`);
    else console.log(`::warning::#${pull.number} ${branch}: push rejected, branch changed during refresh; will retry on the next push to ${base}`);
  } else if (result.outcome === "blocked") {
    failed = true;
    console.log(`::error::#${pull.number} ${branch}: conflicts outside the compiled narrative need a human: ${result.conflicts.join(", ") || result.detail}`);
  } else if (result.outcome === "invalid") {
    failed = true;
    console.log(`::error::#${pull.number} ${branch}: merged fragments do not validate: ${result.detail}`);
  } else {
    console.log(`#${pull.number} ${branch}: ${result.outcome}, nothing to do`);
  }
}
if (failed) process.exit(1);
