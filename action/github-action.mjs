import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_KINDS, createFragment, loadConfig, compile, summariseDecision } from "../bin/narrative.mjs";

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

const NARRATIVE_HEADINGS = ["Narrative Kind", "Narrative Context", "Narrative Decision", "Narrative Consequences"];

/** Parse the exact H2 evidence headings a qualifying PR must author. */
export function parseNarrativeEvidence(rawBody) {
  const body = String(rawBody || "").replace(/\r\n?/g, "\n");
  const headings = [...body.matchAll(/^## (Narrative Kind|Narrative Context|Narrative Decision|Narrative Consequences)[ \t]*$/gm)];
  const evidence = new Map();

  for (const heading of NARRATIVE_HEADINGS) {
    const matches = headings.filter((match) => match[1] === heading);
    if (matches.length !== 1) {
      throw new Error(`A narrative-required PR must contain exactly one '## ${heading}' heading; found ${matches.length}.`);
    }
    const start = matches[0].index + matches[0][0].length;
    const following = headings.find((match) => match.index > matches[0].index);
    const content = body.slice(start, following?.index).trim();
    if (!content) throw new Error(`'## ${heading}' must be non-empty.`);
    evidence.set(heading, content);
  }

  const kind = evidence.get("Narrative Kind");
  if (!ALLOWED_KINDS.has(kind)) {
    throw new Error(`'## Narrative Kind' must contain exactly one canonical value: ${[...ALLOWED_KINDS].join(", ")}. Received '${kind}'.`);
  }
  return {
    kind,
    context: evidence.get("Narrative Context"),
    decision: evidence.get("Narrative Decision"),
    consequences: evidence.get("Narrative Consequences"),
  };
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

export async function maintain() {
  if (!token || !eventPath || !repository) fail("github-token, GITHUB_EVENT_PATH and GITHUB_REPOSITORY are required");
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const pr = event.pull_request;
  if (!pr?.merged) return console.log("Pull request was not merged; no narrative proposal required.");
  if (requiredLabel && !pr.labels.some((label) => label.name === requiredLabel)) {
    return console.log(`Merged PR does not carry '${requiredLabel}'; no narrative proposal required.`);
  }

  let narrative;
  try {
    // Validate every author-supplied field before touching configuration, fragments, Git, or GitHub.
    narrative = parseNarrativeEvidence(pr.body);
  } catch (error) {
    fail(error.message);
  }

  const config = loadConfig(configPath);
  const mergedAt = new Date(pr.merged_at).toISOString();
  const date = mergedAt.slice(0, 10);
  const slug = slugify(pr.title) || `pull-request-${pr.number}`;
  const summary = summariseDecision(narrative.decision, config.summaryMaxCharacters);
  createFragment(config, {
    date,
    slug,
    title: pr.title,
    summary,
    kind: narrative.kind,
    context: narrative.context,
    decision: narrative.decision,
    consequences: narrative.consequences,
    evidence: `${pr.html_url}; merge commit ${pr.merge_commit_sha}`,
    status: "accepted",
    // Orders same-day entries by true merge order. `date` alone cannot: two PRs merged hours apart
    // on the same calendar day would otherwise tie and fall back to alphabetic filename order.
    sequence: mergedAt,
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
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  maintain().catch((error) => fail(error.message));
}
