# Project Narrative

Project Narrative maintains a reviewable decision history for a GitHub repository. It turns explicit
decision evidence from merged pull requests into proposed narrative fragments, validates those
fragments deterministically, and compiles them into `Narrative.md`.

It is deliberately not an automated changelog. The processor will not invent rationale from a diff.
A pull request must opt in with a label and provide explicit Context, Decision and Consequences. The
processor then opens a draft narrative PR so a human can review the interpretation before it becomes
part of the repository's record.

## Design

- Accepted fragments stay in the target repository under `narrative/entries/`.
- `Narrative.md` is a deterministic projection and must not be hand-edited.
- Slugs are durable identities; displayed entry numbers are derived.
- AI may help an author draft the three PR sections, but no model participates in validation,
  compilation, ordering or merging.
- Repository review remains the authority for accepting a narrative entry.

## Install in a repository

Add `.project-narrative.json`:

```json
{
  "schemaVersion": 1,
  "title": "My Project — Narrative",
  "fragments": "narrative/entries",
  "preamble": "narrative/preamble.md",
  "output": "Narrative.md",
  "summaryMaxCharacters": 240
}
```

Add a `pull_request` workflow using this action; see `examples/maintain-narrative.yml`. Give the
workflow `contents: write` and `pull-requests: write` so it can open a draft proposal branch.

Use the same action with `mode: check` in a read-only PR workflow to validate fragments and confirm
that the compiled projection is current.

Decision-bearing pull requests must carry `narrative-required` and contain:

```markdown
## Narrative Context

Why a decision was needed and what evidence constrained it.

## Narrative Decision

What was chosen, including material rejected alternatives.

## Narrative Consequences

What changes, the costs introduced, and anything deliberately left open.
```

After the PR merges, the action creates an `automation/narrative-pr-<number>` branch and a draft PR
containing the fragment and regenerated narrative.

The generated fragment records the underlying decision as `accepted` because its evidence is an
already-merged, explicitly labelled PR. Merging the draft narrative PR accepts the wording of that
record; it does not retroactively accept the project decision.

## CLI

Requires Node 20 or newer and has no runtime dependencies.

```bash
node bin/narrative.mjs init
node bin/narrative.mjs validate
node bin/narrative.mjs compile
node bin/narrative.mjs check
```

## Distribution constraint

GitHub Actions can only consume this action from repositories that are allowed to access it. If the
processor repository is private and a consumer is public, publish this repository/action publicly or
use another public distribution channel before enabling the consumer workflow.
