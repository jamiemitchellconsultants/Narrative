---
date: 2026-09-19
slug: add-refresh-mode-to-keep-open-narrative-proposals-mergeable
title: "Add refresh mode to keep open narrative proposals mergeable"
summary: "Automate that single resolution as a new action mode, `refresh`, run by a consumer workflow on pushes to the default branch that touch the narrative. It acts only on the repository's own `automation/narrative-pr-<number>` branches."
kind: product
status: accepted
sequence: 2026-09-19T19:34:10.000Z
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/22; merge commit 4021f4808cf650d1ab60a697f73278df9a73f7ef"
---

## Context

Each proposal is cut from its own merge commit and carries a freshly compiled `Narrative.md`. When two proposals are open at once, whichever merges second conflicts on `Narrative.md`. Fragments never conflict, because their filenames are unique. The contract already says the compiled file is never hand-merged; the fix is always to merge the default branch and recompile. But that needed a human every time, and EventBooking hit it as soon as two decision-bearing PRs merged in the same session.

## Decision

Automate that single resolution as a new action mode, `refresh`, run by a consumer workflow on pushes to the default branch that touch the narrative. It acts only on the repository's own `automation/narrative-pr-<number>` branches. It resolves a conflict only when the compiled output is the sole conflicting file, commits only after `narrative check` passes, and never force-pushes. Anything else fails visibly and is left for a human.

Rejected alternatives:
- Stop committing `Narrative.md` in proposals and compile after merge. That would remove the reviewable compiled diff, and would need a default-branch write that the review-first contract avoids.
- Put the fix in each consumer repository. Every consumer would carry a duplicate.
- Rebase and force-push. That rewrites a branch a reviewer may already be reading.

## Consequences

Consumers with the new workflow stop seeing `Narrative.md` conflicts on proposals. Existing installations must add the workflow themselves, since `install` never overwrites, but re-running `install` adds just this file. Because pushes made with `GITHUB_TOKEN` don't trigger other workflows, `validate-narrative` does not re-run on refreshed commits; the in-process `narrative check` stands in for it. The refresh job needs `contents: write` and `pull-requests: read`. Conflicts in other files still need a human.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
