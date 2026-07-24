---
date: 2026-07-24
slug: ci-gate-narrative-required-pr-bodies-before-merge
title: "ci: gate narrative-required PR bodies before merge"
summary: "Add a deterministic pre-merge gate to the existing validation workflow that mirrors the action's `section()` logic and runs on `narrative-required` PRs, triggered on body and label edits."
kind: product
status: accepted
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/7; merge commit 8973f58b18e24d691e744580692fe02c35737e27"
---

## Context

The `narrative-required` label promises an explicit decision, but the three required sections were only checked by the post-merge `maintain` action. A labelled PR merged without them fails maintenance after the fact and yields no narrative entry, and the already-merged body can no longer be re-captured.

## Decision

Add a deterministic pre-merge gate to the existing validation workflow that mirrors the action's `section()` logic and runs on `narrative-required` PRs, triggered on body and label edits. Keep it dependency-free and read the untrusted PR body only as data, consistent with the processor's security posture.

## Consequences

Labelled PRs are now blocked at review time until their body carries the three non-empty sections, so the post-merge `maintain` step can no longer fail for a missing heading. Validation now runs on all PR edits, extending the deterministic fragment `check` to PRs that touch no narrative files. This PR dogfoods the new gate against its own body.
