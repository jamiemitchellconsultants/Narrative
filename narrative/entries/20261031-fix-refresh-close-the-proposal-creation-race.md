---
date: 2026-10-31
slug: fix-refresh-close-the-proposal-creation-race
title: "fix(refresh): close the proposal-creation race"
summary: "Keep deterministic merge-and-recompile recovery and trigger it again after successful maintenance completion, with an explicit manual recovery event. The action understands these native events directly and keeps existing push behavior."
kind: product
status: accepted
sequence: 2026-10-31T06:47:46.000Z
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/24; merge commit 4aede326c39e3212f6c355a9be6d77eb84a83822"
---

## Context

Grooveloom's concurrent narrative proposals exposed a gap in push-only recovery: the refresh ran before the maintenance action finished creating its proposal. The generated document then conflicted even though source fragments were independent.

## Decision

Keep deterministic merge-and-recompile recovery and trigger it again after successful maintenance completion, with an explicit manual recovery event. The action understands these native events directly and keeps existing push behavior. Refresh executes only trusted default-branch code and consumes no artifacts from the completed workflow.

## Consequences

Late-created proposals can recover without another narrative merge. Existing installations must update their workflow triggers and keep the configured maintenance workflow name aligned. Review, validation, source-fragment preservation, non-force pushes and conflict refusal outside generated output remain required.

AI-Fingerprint: sha256:2d174dd5876c
