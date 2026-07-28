---
date: 2026-07-28
slug: fix-order-same-day-narrative-entries-by-merge-time-not-filename
title: "fix: order same-day narrative entries by merge time, not filename"
summary: "Add `sequence` rather than giving `date` time precision."
kind: product
status: accepted
sequence: 2026-07-28T03:01:16.000Z
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/11; merge commit c1c6ee72306641a117020d2a8d6a205db34fe66a"
---

## Context

This was found while migrating the finance reference model in a downstream consumer repository
(OntologyService). Seven PRs merged on one calendar day during a multi-stage migration, and the
compiled `Narrative.md` put the closing migration stage (merged last, 18:51 UTC) ahead of two earlier
stages it depended on (merged 10:32 and 12:00 UTC) — purely because "feat-migrate-…" sorts before
"feat-remodel-…" alphabetically. The same mechanism had already scrambled two smaller same-day
groups from earlier in that repository's history. Any consumer landing more than one narrative-worthy
PR in a day hits this; it just hadn't been noticed before because it usually reads as plausible even
when wrong, since same-day entries are usually related work.

## Decision

Add `sequence` rather than giving `date` time precision. Two alternatives were rejected:

- **Widen `date` to a timestamp.** Rejected: `date` is a rendered, reader-facing value with
  intentional day granularity ("2026-07-27"), and every existing fragment across every consumer
  repository would need reformatting to stay valid against a tightened `DATE_RE`. That is a breaking
  schema change for a display concern that was never wrong — only the tiebreak was.
- **Derive order from git** (first-parent commit order on the default branch). Rejected: fragments
  are added by a bot-authored PR that is itself reviewed and merged, sometimes out of order relative
  to when the original PR merged, and a purely git-derived order would depend on repository history
  shape in ways a plain field does not. An explicit field is auditable by reading the fragment.

`sequence` is deliberately never rendered — it exists to answer "which came first," not "when did
this happen," which `date` already answers for a reader. The action populates it automatically from
`pr.merged_at`, so the fix is transparent to every consumer already using the standard scaffolded
workflow; nothing in a consumer repository needs to change.

## Consequences

Every consumer using `@main` gets correct same-day ordering the next time their `maintain` workflow
runs, with no action required. A consumer with an already-scrambled `Narrative.md` from a same-day
group (OntologyService is one; there may be others) needs a one-time backfill: add `sequence` to the
affected historical fragments using their real PR merge timestamps, then recompile. That backfill is
being done separately in OntologyService, and is a narrative-repair change there — explicitly not
`narrative-required`, per the same repository's own rule against recursively narrating narrative
maintenance.

Consumers pinned to a specific commit or tag rather than `@main` do not receive this fix until they
repin.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
