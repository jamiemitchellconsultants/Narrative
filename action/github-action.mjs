import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createFragment, loadConfig, compile } from "../bin/narrative.mjs";

const token = process.env.INPUT_GITHUB_TOKEN;
const configPath = process.env.INPUT_CONFIG || ".project-narrative.json";
const requiredLabel = process.env.INPUT_REQUIRED_LABEL ?? "narrative-required";
const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY;
const apiUrl = process.env.GITHUB_API_URL || "https://api.github.com";

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function section(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.match(new RegExp(`(?:^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"))?.[1]?.trim();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
}

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...options.headers },
  });
  if (!response.ok) fail(`GitHub API ${response.status}: ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

if (!token || !eventPath || !repository) fail("github-token, GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required");
const event = JSON.parse(readFileSync(eventPath, "utf8"));
const pr = event.pull_request;
if (!pr?.merged) {
  console.log("Pull request was not merged; no narrative proposal required.");
  process.exit(0);
}
if (requiredLabel && !pr.labels.some((label) => label.name === requiredLabel)) {
  console.log(`Merged PR does not carry '${requiredLabel}'; no narrative proposal required.`);
  process.exit(0);
}

const body = pr.body || "";
const context = section(body, "Narrative Context");
const decision = section(body, "Narrative Decision");
const consequences = section(body, "Narrative Consequences");
if (!context || !decision || !consequences) {
  fail("A narrative-required PR must contain Narrative Context, Narrative Decision and Narrative Consequences headings");
}

const config = loadConfig(configPath);
const date = new Date(pr.merged_at).toISOString().slice(0, 10);
const slug = slugify(pr.title) || `pull-request-${pr.number}`;
const summary = decision.split(/\n\n|\n/)[0].replace(/\s+/g, " ").slice(0, config.summaryMaxCharacters);
createFragment(config, {
  date,
  slug,
  title: pr.title,
  summary,
  kind: "product",
  context,
  decision,
  consequences,
  evidence: `${pr.html_url}; merge commit ${pr.merge_commit_sha}`,
  status: "accepted",
});
compile(configPath);

const branch = `automation/narrative-pr-${pr.number}`;
execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
execFileSync("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
execFileSync("git", ["switch", "-c", branch]);
execFileSync("git", ["add", config.fragments, config.output]);
execFileSync("git", ["commit", "-m", `docs: propose narrative for PR #${pr.number}`]);
execFileSync("git", ["push", "--force", "origin", branch], { stdio: "inherit" });

const [owner, repo] = repository.split("/");
const existing = await request(`/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`);
if (!existing.length) {
  await request(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `docs: propose narrative for PR #${pr.number}`,
      head: branch,
      base: event.repository.default_branch,
      body: `Generated from the evidence and explicit narrative sections in #${pr.number}. Review the fragment as an interpretation before merging.`,
      draft: true,
    }),
  });
}
console.log(`Created reviewed narrative proposal on ${branch}`);
