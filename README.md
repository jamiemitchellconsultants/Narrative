# Project Narrative

Project Narrative maintains a reviewable decision history for a GitHub repository. It turns
explicit decision evidence from merged pull requests into proposed narrative fragments, validates
those fragments deterministically, and compiles them into `Narrative.md`.

It is deliberately not an automated changelog. The processor will not invent rationale from a
diff. A pull request must opt in with a label and provide explicit Context, Decision and
Consequences. After that PR merges, the processor opens a separate draft narrative PR so a human
can review the wording before it becomes part of the repository's accepted record.

## How it works

1. A project PR is labelled `narrative-required` and contains three narrative sections.
2. The project PR is reviewed and merged normally.
3. A GitHub Actions workflow runs the external Project Narrative action.
4. The action creates one fragment under `narrative/entries/` and recompiles `Narrative.md`.
5. The action pushes `automation/narrative-pr-<number>` and opens a draft narrative PR.
6. A human reviews and merges that draft to accept the wording into the project record.

Accepted fragments stay in the target repository. `Narrative.md` is a deterministic projection and
must not be hand-edited. Slugs are durable identities; displayed entry numbers are derived. AI may
help an author draft the PR sections, but no model participates in validation, compilation,
ordering, or merging.

## Quick install

Most adopters do not need the step-by-step guide. From the root of your repository, with Node.js 20
or newer:

```bash
npx --yes --package=github:jamiemitchellconsultants/Narrative narrative install
```

`narrative install` is non-destructive and scaffolds the configuration, preamble, compiled
`Narrative.md`, both workflows, and the PR template in one step. It then prints the three manual
follow-ups it cannot perform for you: enabling workflow PR-creation permission, creating the
`narrative-required` label, and merging the scaffolded files to your default branch.

If you drive setup through a coding agent — for example *"add jamiemitchellconsultants/narrative to
this repo"* — point it at [`INSTALL.md`](INSTALL.md), which is written for the installing agent and
makes the outcome deterministic across tools.

The step-by-step guide below explains what `narrative install` scaffolds and why, for adopters who
prefer to apply each piece by hand or need custom paths.

## New repository setup — step by step

The instructions below assume that your repository already exists on GitHub and that GitHub Actions
is enabled. Complete the steps on a branch and merge them through your normal review process.

### 1. Check action access

This action is currently referenced as:

```yaml
uses: jamiemitchellconsultants/Narrative@main
```

The consumer repository must be allowed to use public GitHub actions. For a private organisation,
check **Settings → Actions → General → Actions permissions** and ensure public actions are allowed.

Using `@main` receives processor updates immediately. For stricter supply-chain control, replace it
with a reviewed commit SHA and update that pin deliberately when adopting a new processor version.

### 2. Allow the workflow to create narrative pull requests

In the consumer repository, open:

**Settings → Actions → General → Workflow permissions**

Select **Read and write permissions**, enable **Allow GitHub Actions to create and approve pull
requests**, and save.

This repository-level setting is required even though the workflow below declares `contents: write`
and `pull-requests: write`. If it is disabled, the processor can push its automation branch but the
GitHub API rejects creation of the draft PR with HTTP 403.

### 3. Create the trigger label

Create a label named exactly:

```text
narrative-required
```

Suggested description: `Merged PR must produce a reviewed project narrative entry`.

You can create it in **Issues → Labels**, or with GitHub CLI:

```bash
gh label create narrative-required \
  --description "Merged PR must produce a reviewed project narrative entry" \
  --color 1D76DB
```

Only merged PRs carrying this label are captured. Mechanical PRs can remain unlabelled and are
ignored.

### 4. Add the narrative configuration

Create `.project-narrative.json` at the repository root:

```json
{
  "schemaVersion": 1,
  "title": "My Project — Project Narrative",
  "fragments": "narrative/entries",
  "preamble": "narrative/preamble.md",
  "output": "Narrative.md",
  "summaryMaxCharacters": 240
}
```

Change `title` to your project name. Keep the standard paths initially; custom paths work, but the
workflow path filters in later steps must be changed to match them.

### 5. Add the hand-authored preamble

Create `narrative/preamble.md`:

```markdown
# My Project — Project Narrative

This document records what was asked, what was decided, why, and what followed.
Reviewed fragments are authoritative; this compiled document is their deterministic projection.
```

Create the empty fragment directory too:

```bash
mkdir -p narrative/entries
```

Git does not track an empty directory, so this directory may not appear in the repository until the
first fragment is generated. That is expected.

### 6. Generate the initial `Narrative.md`

The CLI requires Node.js 20 or newer. From the consumer repository root, run:

```bash
npx --yes --package=github:jamiemitchellconsultants/Narrative narrative init
```

This preserves existing configuration and preamble files, creates any missing standard directories,
and deterministically writes the initial `Narrative.md`. Commit that generated file, but do not
hand-edit it later.

If you prefer not to run a GitHub package through `npx`, clone this repository at a reviewed commit
and invoke its `bin/narrative.mjs` with Node:

```bash
node /path/to/Narrative/bin/narrative.mjs init
```

### 7. Add the maintenance workflow

Create `.github/workflows/maintain-narrative.yml`:

```yaml
name: Maintain project narrative

on:
  pull_request:
    types: [closed]

permissions:
  contents: write
  pull-requests: write

jobs:
  maintain:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: jamiemitchellconsultants/Narrative@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          required-label: narrative-required
```

The job runs for every closed PR but exits without changing anything when the PR was not merged or
does not carry the required label.

### 8. Add deterministic validation

Create `.github/workflows/validate-narrative.yml`:

```yaml
name: Validate project narrative

on:
  pull_request:
    paths:
      - ".project-narrative.json"
      - "narrative/**"
      - "Narrative.md"

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate fragments and compiled narrative
        uses: jamiemitchellconsultants/Narrative@main
        with:
          mode: check
```

This check rejects invalid fragments and a compiled document that no longer matches its source
fragments.

### 9. Add the PR-authoring template

Create or extend `.github/pull_request_template.md`:

```markdown
## Change

Describe the repository change.

## Narrative classification

- Apply `narrative-required` when this PR makes a meaningful product, architecture, governance,
  operational, correction, or experimental decision.
- Leave the label off for mechanical changes that do not alter project intent.

Delete the three sections below when the PR does not require a narrative entry.

## Narrative Context

Why was a decision needed, and what evidence or constraints shaped it?

## Narrative Decision

What was chosen? Include material rejected alternatives where they aid future understanding.

## Narrative Consequences

What changes, what trade-offs result, and what remains deliberately open?
```

The three heading names are an interface consumed by the processor and must remain exact. A labelled
PR missing any of them fails visibly instead of receiving invented rationale.

### 10. Optionally protect the accepted record

Add these paths to `.github/CODEOWNERS` if narrative changes require specific human approval:

```text
/Narrative.md              @your-owner-or-team
/narrative/                @your-owner-or-team
/.project-narrative.json  @your-owner-or-team
```

Combine this with branch protection or repository rulesets if explicit review is mandatory. The
processor always opens its proposal as a draft; repository governance decides who may accept it.

### 11. Commit and merge the installation

Your installation PR should contain at least:

```text
.github/
├── pull_request_template.md
└── workflows/
    ├── maintain-narrative.yml
    └── validate-narrative.yml
.project-narrative.json
Narrative.md
narrative/
└── preamble.md
```

Merge this installation PR before attempting the first decision capture, because workflows only run
from files already present on the default branch.

## Run the first end-to-end test

### 1. Create a small decision-bearing change

Create a normal project branch and make a small, reversible policy or feature decision. Avoid using
a purely mechanical edit: the test should contain a real decision that can be described honestly.

### 2. Open the project PR

Complete `Narrative Context`, `Narrative Decision`, and `Narrative Consequences` in the PR body. Keep
the one-line decision clear: it becomes the generated index summary, bounded by
`summaryMaxCharacters` without cutting a sentence or word in half.

### 3. Apply `narrative-required`

Apply the label before merging. The processor reads labels from the merged PR event.

### 4. Review and merge the project PR

Review it as normal. Its merge accepts the project decision. It does not yet accept the wording of
the narrative record.

### 5. Observe the maintenance run

Open **Actions → Maintain project narrative**. A successful run should:

- create `narrative/entries/<YYYYMMDD>-<title-slug>.md`;
- regenerate `Narrative.md`;
- push `automation/narrative-pr-<source-pr-number>`; and
- open `docs: propose narrative for PR #<source-pr-number>` as a draft PR.

The fragment records the source PR URL and merge commit as evidence. It records the underlying
decision as `accepted` because that decision was already accepted by merging the labelled project
PR. Merging the narrative PR accepts the wording of the record.

### 6. Review the generated narrative PR

Confirm that:

- Context accurately describes why a decision was needed.
- Decision states what was chosen and preserves material rejected alternatives.
- Consequences describe costs, effects, and deliberately open questions.
- Evidence identifies the correct source PR and merge commit.
- The index summary is concise and complete.
- `Narrative.md` contains the same entry as the fragment.
- The validation workflow passes.

Edit the fragment on the automation branch if wording needs correction, then rerun the compiler and
commit both the fragment and `Narrative.md`.

### 7. Merge the narrative PR

After review, mark the draft ready if your rules require it and merge it. The repository now owns its
first accepted narrative entry. Future labelled decisions follow the same two-PR cycle.

## Choosing what deserves an entry

Apply `narrative-required` when a PR makes or changes a meaningful:

- product or domain decision;
- architecture or integration decision;
- governance or development-process decision;
- operational policy;
- correction to an earlier recorded decision; or
- experiment whose outcome should affect later work.

Usually omit it for formatting, dependency refreshes with no policy choice, generated-file refreshes,
typo fixes, and mechanical refactors that preserve intent. The objective is a replayable decision
history, not a second commit log.

## Fragment format

Generated fragments use constrained front matter and three ordered sections:

```markdown
---
date: 2026-07-21
slug: choose-a-managed-queue
title: "Choose a managed queue"
summary: "Use a managed queue for delivery buffering."
kind: architecture
status: accepted
sequence: 2026-07-21T09:30:00Z
evidence: "https://github.com/example/project/pull/42; merge commit abc123"
---

## Context

Why a decision was required.

## Decision

What was chosen and the material alternatives.

## Consequences

What follows, including trade-offs and open questions.
```

`date` has day precision and is what readers see. `sequence` is optional, never rendered, and
exists only to order fragments that tie on `date` — routine when several PRs land in one session.
The action populates it automatically from the PR's merge timestamp; a hand-authored fragment can
omit it, and same-day fragments without one fall back to filename order as before.

Supported kinds are `architecture`, `product`, `governance`, `operational`, `correction`, and
`experiment`. Supported statuses are `proposed`, `accepted`, and `superseded`.

## CLI reference

The CLI requires Node.js 20 or newer and has no runtime dependencies:

```bash
# Create missing standard files and compile the initial document
node bin/narrative.mjs init

# Scaffold everything init does, plus the workflows and PR template (non-destructive)
node bin/narrative.mjs install

# Validate every fragment
node bin/narrative.mjs validate

# Regenerate Narrative.md
node bin/narrative.mjs compile

# Fail if fragments are invalid or Narrative.md is stale
node bin/narrative.mjs check

# Use a non-default configuration file
node bin/narrative.mjs check --config path/to/project-narrative.json
```

When invoking the public repository without a local clone, use:

```bash
npx --yes --package=github:jamiemitchellconsultants/Narrative narrative check
```

## Troubleshooting

### The automation branch exists, but no draft PR was opened

The workflow log usually contains:

```text
GitHub Actions is not permitted to create or approve pull requests.
```

Enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and
approve pull requests**, then rerun the failed workflow.

### The maintenance workflow succeeded but did nothing

Check that the source PR:

- was merged rather than merely closed;
- carried `narrative-required` at merge time; and
- used the configured label spelling exactly.

The job deliberately exits successfully for non-qualifying PRs.

### A labelled PR makes the workflow fail before pushing

Confirm its body contains non-empty `## Narrative Context`, `## Narrative Decision`, and
`## Narrative Consequences` sections. Heading names and levels must be exact.

### Validation reports that `Narrative.md` is stale

Edit the fragment, not `Narrative.md`, then run:

```bash
node /path/to/Narrative/bin/narrative.mjs compile
```

Commit the edited fragment and regenerated document together.

### GitHub cannot resolve `jamiemitchellconsultants/Narrative@main`

Check consumer action permissions and verify that the referenced branch, tag, or SHA exists. A
public consumer cannot use an action stored only in an inaccessible private repository.

### A rerun says the automation branch already exists

Normal reruns use a fresh Actions checkout and force-update the same
`automation/narrative-pr-<number>` remote branch. If someone manually created a conflicting local
branch in a custom runner, remove or rename that local branch before retrying.

### The generated narrative PR has no checks

GitHub does not start new workflow runs for some events created with the repository's own
`GITHUB_TOKEN`. A later human-authenticated push to the automation branch will trigger normal PR
checks. Regardless, review the deterministic fragment and compiled diff before merging and retain
branch protection appropriate to your repository.

## Security and governance notes

- The maintenance job needs `contents: write` to push its automation branch and
  `pull-requests: write` to open the proposal.
- The validation job needs only `contents: read`.
- No PAT, GitHub App secret, model credential, or external API key is required.
- The action treats PR prose as data and does not execute it as shell input.
- Compilation is local, model-free, network-free, and deterministic.
- Human review remains the authority for accepting narrative wording.
