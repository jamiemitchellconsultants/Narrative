---
date: 2026-07-30
slug: require-the-consumer-s-agent-instructions-to-record-the-contract
title: "Require the consumer's agent instructions to record the contract"
summary: "`INSTALL.md` gains a step, placed before Verification so it is part of installation rather than an afterthought: find the consumer's canonical instruction file — `CLAUDE.md` or `AGENTS.md`, whichever that repository already treats as…"
kind: product
status: accepted
sequence: 2026-07-30T04:48:30.000Z
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/14; merge commit eec9f8ebd04a9d7f91d337ce3c991ab0db57d74b"
---

## Context

`INSTALL.md` told an installing agent to scaffold the workflows and template, surface three manual follow-ups, run `narrative check`, and observe four prohibitions. It said nothing about instruction files.

That makes the mechanism *available* and leaves it undiscoverable. An agent working in the consumer repository weeks later has no way to learn that a decision-bearing pull request needs the label and three exact body headings, so it merges decision-bearing changes that produce no entry — and the failure is silent, because an unlabelled merged pull request is indistinguishable to the workflow from a mechanical one.

This is observed, not theoretical. `BrightFlagProxyMCPBuilder` was installed through this recipe and lost entries on four consecutive pull requests. The diagnosis matters: its pull-request template documented the label rule correctly the entire time. The agent never read it, because creating a pull request with a supplied body replaces the template wholesale. Three of those four entries had to be reconstructed by hand afterwards, which the merge-event-only trigger makes the only available repair.

## Decision

`INSTALL.md` gains a step, placed before Verification so it is part of installation rather than an afterthought: find the consumer's canonical instruction file — `CLAUDE.md` or `AGENTS.md`, whichever that repository already treats as authoritative — create it if neither exists, and **append** if one does, never overwrite. That is the same non-destructive rule the recipe already applies to an existing pull-request template.

The required content is the contract an agent needs before it can open a correct pull request: generated output is never hand-edited; both the label and the three exactly-spelled headings are required; the workflow fires on the merge event only so neither omission is repairable afterwards; a supplied body replaces the template; narrative-only pull requests carry no label; an accepted entry is never rewritten, a reversal is a new `correction` entry citing the original by slug.

Deliberately **not** implemented in the `install` command. That would make the step non-optional instead of dependent on agent compliance, but it means writing and testing a non-destructive merge into a file whose structure the processor does not own. `AGENTS.md` states plainly that `install` writes no instruction files, so the boundary is explicit rather than an omission a future reader might treat as a bug.

Accepts that the consumer's canonical file may be either `CLAUDE.md` or `AGENTS.md`. Both conventions exist across the repositories using this processor and the recipe follows whichever it finds, rather than imposing one.

## Consequences

An installation now produces a repository whose agents can discover the contract without a human relaying it, closing the gap between the mechanism being present and being known.

The recipe grows, and it now depends on the installing agent following a step the CLI cannot verify. `narrative check` still cannot tell whether the instruction file exists, so this is a documented obligation rather than an enforced one — the honest position, and stated as such.

The pointer-file guidance is offered rather than required, since a consumer repository may reasonably steer only the agents it uses.

`npm run check` passes at 13/13; no CLI, action, or contract behaviour changed.
