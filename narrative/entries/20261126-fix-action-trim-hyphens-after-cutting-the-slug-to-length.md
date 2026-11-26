---
date: 2026-11-26
slug: fix-action-trim-hyphens-after-cutting-the-slug-to-length
title: "fix(action): trim hyphens after cutting the slug to length"
summary: "Cut to the length limit first, then trim leading and trailing hyphens, so every generated slug satisfies the slug rule `createFragment` enforces."
kind: product
status: accepted
sequence: 2026-11-26T15:58:41.000Z
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/26; merge commit a671ccdda02aeb0f5c74f79eb39769742c4a9875"
---

## Context

The maintain action failed on merge for claude-plugins#19. Its title, "feat(lifecycle): architect baseline and deployment questions derived from behaviours", slugified to `feat-lifecycle-architect-baseline-and-deployment-questions-derived-from-`: `slugify` trimmed hyphens before cutting to 72 characters, so the cut left a trailing hyphen. `createFragment` correctly rejects that ("entry slug must be lower-case kebab-case"). The action exited with no proposal, and the consumer had to write the missed entry by hand. Any title whose cut lands just after a hyphen hits the same failure.

## Decision

Cut to the length limit first, then trim leading and trailing hyphens, so every generated slug satisfies the slug rule `createFragment` enforces. We moved `slugify` into `bin/narrative.mjs` as an export, because the action runs at import time and cannot be unit tested where the function lived. We rejected loosening `createFragment`'s check: slugs are durable identities, and the check is right.

## Consequences

A merged PR whose title cut lands after a hyphen now gets its proposal, with a slug one character shorter than 72. Slugs for all other titles are unchanged, so existing fragment identities are unaffected. Still open: PR footers after the Consequences section are captured into fragments.
