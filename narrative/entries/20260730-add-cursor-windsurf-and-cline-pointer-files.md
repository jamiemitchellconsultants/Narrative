---
date: 2026-07-30
slug: add-cursor-windsurf-and-cline-pointer-files
title: "Add Cursor, Windsurf and Cline pointer files"
summary: "Add one pointer per missing tool, each stating only that `AGENTS.md` is authoritative, that every rule there is binding regardless of tool, and that instruction changes belong in `AGENTS.md` rather than the pointer."
kind: product
status: accepted
sequence: 2026-07-30T04:47:19.000Z
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/13; merge commit 5fb5bd4a60c178baa99a8176820b12586b660503"
---

## Context

`AGENTS.md` is this repository's authoritative instruction file, and `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` already point at it. Cursor, Windsurf and Cline had no pointer, so an agent running under any of those three saw no project instructions at all — including the "Project Narrative requirements" section that governs how pull requests in this very repository must be classified and labelled.

That gap matters more here than in a consumer repository. This repo defines the processor contract; an agent changing parsing, rendering, or the action flow without having read the core contracts and testing expectations can weaken validation while appearing to succeed.

The gap was found while applying this repository's own instruction-file pattern to two sibling repositories, where the equivalent absence had a measurable cost: four pull requests merged without narrative entries because nothing on disk told the agent the label and body sections were both required.

## Decision

Add one pointer per missing tool, each stating only that `AGENTS.md` is authoritative, that every rule there is binding regardless of tool, and that instruction changes belong in `AGENTS.md` rather than the pointer.

Keep `AGENTS.md` authoritative rather than inverting to `CLAUDE.md`. The sibling repositories use `CLAUDE.md` as their source of truth, so the family is now inconsistent in direction — but that inconsistency is preferable to churning a deliberate choice in the repository whose `AGENTS.md` is the canonical statement of the processor contract.

Each pointer surfaces the label-plus-body-sections rule specifically, with `## Narrative Context`, `## Narrative Decision` and `## Narrative Consequences` on their own lines as a list. Reflowing prose had silently split those names across line breaks; they render correctly either way, but an agent grepping for the exact heading it must emit would not find it.

## Consequences

All six tier-one agents now reach the same instructions, and none of the six contains a copy of them — a stale copy is worse than no copy, because an agent cannot tell which is current.

The pointer set is a maintenance surface: adding a tool means adding a file and updating the lists in the others. Keeping the pointers content-free bounds that cost to one line per file.

`npm run check` passes unchanged; no processor behaviour, contract, or test is touched.
