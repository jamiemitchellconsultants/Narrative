---
date: 2026-07-23
slug: feat-make-project-narrative-self-hosting
title: "feat: make Project Narrative self-hosting"
summary: "Make Narrative self-hosting."
kind: product
status: accepted
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/5; merge commit 6b377538af187557f199e35c98efd73dc138f5de"
---

## Context

Project Narrative gives consumer repositories a deterministic, review-first decision history, but its own repository did not maintain that history. Processor decisions could therefore merge without the label, explicit evidence, separate proposal, or deterministic validation recommended to consumers. PR #4 established canonical agent instructions and the narrative-required label, but no configuration, accepted record, or workflows existed to enforce the process.

## Decision

Make Narrative self-hosting. Configure its standard paths, create the initial governance fragment and compiled Narrative.md, add the exact Narrative sections to the pull-request template, validate narrative changes with the checked-out local action, and run the checked-out local maintenance action after merged pull requests. Continue to gate capture on narrative-required and keep generated proposals separate and draft until human review.

## Consequences

Future meaningful processor decisions can be captured by the same parser, compiler, evidence headings, label, branch convention, and draft-review flow that Narrative publishes. Mechanical changes remain ignored. Maintainers must review generated proposals and keep authoritative fragments synchronized with Narrative.md. One repository setting remains required before maintenance is operational: Settings → Actions → General must enable Allow GitHub Actions to create and approve pull requests. That setting is currently disabled and is intentionally not changed by this PR.
