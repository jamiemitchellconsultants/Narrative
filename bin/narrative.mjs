#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_CONFIG = {
  schemaVersion: 1,
  title: "Project Narrative",
  fragments: "narrative/entries",
  preamble: "narrative/preamble.md",
  output: "Narrative.md",
  summaryMaxCharacters: 240,
};

const REQUIRED_META = ["date", "slug", "title", "summary", "kind", "status"];
const ALLOWED_KINDS = new Set(["architecture", "product", "governance", "operational", "correction", "experiment"]);
const ALLOWED_STATUS = new Set(["proposed", "accepted", "superseded"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SECTION_RE = /^## (Context|Decision|Consequences)\s*$/gm;

export function loadConfig(path = ".project-narrative.json") {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed.schemaVersion !== 1) throw new Error(`${path}: schemaVersion must be 1`);
  return { ...DEFAULT_CONFIG, ...parsed };
}

function quote(value) {
  return JSON.stringify(String(value));
}

function unquote(value) {
  const text = value.trim();
  if (!text.startsWith('"') || !text.endsWith('"')) return text;
  return JSON.parse(text);
}

function realDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function parseFragment(file, raw, config = DEFAULT_CONFIG) {
  const text = raw.replace(/\r\n?/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n+([\s\S]+)$/);
  if (!match) throw new Error(`${file}: missing front matter or body`);

  const meta = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const pair = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (!pair) throw new Error(`${file}: invalid front-matter line '${line}'`);
    if (Object.hasOwn(meta, pair[1])) throw new Error(`${file}: duplicate '${pair[1]}'`);
    meta[pair[1]] = unquote(pair[2]);
  }
  for (const key of REQUIRED_META) {
    if (!meta[key]) throw new Error(`${file}: '${key}' is required`);
  }
  if (!realDate(meta.date)) throw new Error(`${file}: date must be a real YYYY-MM-DD date`);
  if (!SLUG_RE.test(meta.slug)) throw new Error(`${file}: slug must be lower-case kebab-case`);
  if (!ALLOWED_KINDS.has(meta.kind)) throw new Error(`${file}: unsupported kind '${meta.kind}'`);
  if (!ALLOWED_STATUS.has(meta.status)) throw new Error(`${file}: unsupported status '${meta.status}'`);
  if (meta.summary.length > config.summaryMaxCharacters) {
    throw new Error(`${file}: summary exceeds ${config.summaryMaxCharacters} characters`);
  }
  const fileSlug = basename(file, ".md").replace(/^\d+-/, "");
  if (fileSlug !== meta.slug) throw new Error(`${file}: filename slug must match '${meta.slug}'`);

  const headings = [...match[2].matchAll(SECTION_RE)].map((item) => item[1]);
  if (headings.join(",") !== "Context,Decision,Consequences") {
    throw new Error(`${file}: body must contain ## Context, ## Decision, ## Consequences in that order`);
  }
  for (const heading of headings) {
    const section = match[2].match(new RegExp(`## ${heading}\\s*\\n+([\\s\\S]*?)(?=\\n## |$)`));
    if (!section?.[1].trim()) throw new Error(`${file}: ${heading} section is empty`);
  }
  return { file, ...meta, body: match[2].trim() };
}

export function loadFragments(config) {
  if (!existsSync(config.fragments)) return [];
  const fragments = readdirSync(config.fragments)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => parseFragment(file, readFileSync(join(config.fragments, file), "utf8"), config));
  const slugs = new Set();
  for (const fragment of fragments) {
    if (slugs.has(fragment.slug)) throw new Error(`duplicate slug '${fragment.slug}'`);
    slugs.add(fragment.slug);
  }
  return fragments.sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));
}

function escapeCell(value) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function render(config, fragments) {
  const preamble = existsSync(config.preamble)
    ? readFileSync(config.preamble, "utf8").trim()
    : `# ${config.title}\n\nThis is the reviewed decision narrative for this project.`;
  const rows = fragments.map((fragment, index) =>
    `| [${index + 1}](#entry-${fragment.slug}) | ${fragment.date} | ${escapeCell(fragment.title)} | ${fragment.kind} | ${escapeCell(fragment.summary)} |`,
  ).join("\n");
  const entries = fragments.map((fragment, index) =>
    `<a id="entry-${fragment.slug}"></a>\n\n## Entry ${index + 1} — ${fragment.date} — ${fragment.title}\n\n` +
    `*Kind: ${fragment.kind}. Status: ${fragment.status}.*\n\n${fragment.body}`,
  ).join("\n\n---\n\n");
  return `<!-- GENERATED BY PROJECT NARRATIVE. Edit fragments, not this file. -->\n\n${preamble}\n\n## Index\n\n` +
    `| # | Date | Title | Kind | Decision summary |\n|---|---|---|---|---|\n${rows}\n\n---\n\n${entries}${entries ? "\n" : ""}`;
}

export function compile(configPath = ".project-narrative.json", check = false) {
  const config = loadConfig(configPath);
  const output = render(config, loadFragments(config));
  if (check) {
    if (!existsSync(config.output) || readFileSync(config.output, "utf8").replace(/\r\n?/g, "\n") !== output) {
      throw new Error(`${config.output} is stale; run narrative compile`);
    }
    return output;
  }
  mkdirSync(dirname(config.output), { recursive: true });
  writeFileSync(config.output, output);
  return output;
}

export function createFragment(config, entry) {
  let slug = entry.slug;
  if (!SLUG_RE.test(slug)) throw new Error("entry slug must be lower-case kebab-case");
  mkdirSync(config.fragments, { recursive: true });
  const prefix = entry.date.replaceAll("-", "");
  let path = join(config.fragments, `${prefix}-${slug}.md`);
  let suffix = 2;
  while (existsSync(path)) {
    slug = `${entry.slug}-${suffix++}`;
    path = join(config.fragments, `${prefix}-${slug}.md`);
  }
  const evidence = entry.evidence ? `\nevidence: ${quote(entry.evidence)}` : "";
  const status = entry.status ?? "proposed";
  if (!ALLOWED_STATUS.has(status)) throw new Error(`unsupported entry status '${status}'`);
  const contents = `---\ndate: ${entry.date}\nslug: ${slug}\ntitle: ${quote(entry.title)}\n` +
    `summary: ${quote(entry.summary)}\nkind: ${entry.kind}\nstatus: ${status}${evidence}\n---\n\n` +
    `## Context\n\n${entry.context.trim()}\n\n## Decision\n\n${entry.decision.trim()}\n\n` +
    `## Consequences\n\n${entry.consequences.trim()}\n`;
  writeFileSync(path, contents);
  return path;
}

export function init(configPath = ".project-narrative.json") {
  if (!existsSync(configPath)) writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  const config = loadConfig(configPath);
  mkdirSync(config.fragments, { recursive: true });
  mkdirSync(dirname(config.preamble), { recursive: true });
  if (!existsSync(config.preamble)) {
    writeFileSync(config.preamble, `# ${config.title}\n\nThis document records what was asked, what was decided, why, and what followed.\n`);
  }
  compile(configPath);
}

function usage() {
  console.log("Usage: narrative <init|validate|compile|check> [--config path]");
}

function main(argv) {
  const command = argv[0];
  const configIndex = argv.indexOf("--config");
  const configPath = configIndex >= 0 ? argv[configIndex + 1] : ".project-narrative.json";
  if (command === "init") init(configPath);
  else if (command === "validate") loadFragments(loadConfig(configPath));
  else if (command === "compile") compile(configPath);
  else if (command === "check") compile(configPath, true);
  else { usage(); process.exitCode = 2; return; }
  console.log(`narrative ${command}: OK`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`narrative: ${error.message}`); process.exitCode = 1; }
}
