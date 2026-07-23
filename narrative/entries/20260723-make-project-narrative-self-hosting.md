---
date: 2026-07-23
slug: make-project-narrative-self-hosting
title: "Make Project Narrative self-hosting"
summary: "Use Project Narrative's own processor and workflows to maintain a reviewable decision history for the Narrative repository."
kind: governance
status: accepted
---

## Context

Project Narrative provides consumer repositories with a deterministic, review-first decision
history, but its own repository did not maintain that history. Decisions about the processor could
therefore be merged without the label, explicit evidence, separate proposal, or deterministic
validation that the project recommends to its consumers. Agent-control instructions and the
`narrative-required` label established the authoring rule, but no self-hosted workflows or accepted
record existed to enforce it.

## Decision

Configure the Narrative repository as a consumer of its own local GitHub Action. Add the standard
configuration, preamble, fragment directory, generated `Narrative.md`, Narrative-aware pull-request
template, deterministic validation workflow, and post-merge maintenance workflow. Use
`narrative-required` to select meaningful decisions and require explicit Narrative Context,
Narrative Decision, and Narrative Consequences sections. Record this adoption as the initial
accepted governance fragment because the maintenance workflow cannot capture the pull request that
installs it.

## Consequences

Future labelled decisions about the Narrative processor will produce separate draft proposals for
human review, while mechanical changes remain outside the decision record. The repository now
dogfoods the same parser, compiler, label, evidence headings, automation branch convention, and
validation path it publishes. Repository Actions settings must continue to permit the maintenance
workflow to push branches and create pull requests. Maintainers must review generated proposals and
keep the compiled document synchronized with authoritative fragments.
