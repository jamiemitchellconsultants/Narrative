# Repository agent instructions

These instructions apply to the entire repository. They are the canonical project instructions for
coding agents. Agent-specific control files must point here instead of duplicating these rules.

## Project objective

Project Narrative is a deterministic, review-first processor for maintaining the decision history
of a GitHub repository. It converts explicit evidence from qualifying merged pull requests into
proposed narrative fragments and a compiled `Narrative.md`.

It is deliberately not a changelog generator:

- It never invents rationale from code or diffs.
- A pull request opts in through the configured label.
- Context, Decision, and Consequences must be supplied explicitly in the pull-request body.
- Generated wording is proposed on a separate draft pull request.
- Human review remains the authority that accepts a fragment.
- Validation, ordering, compilation, and merging are model-free and deterministic.

Read `README.md`, `action.yml`, `bin/narrative.mjs`, and `action/github-action.mjs` before changing
the processor contract.

## Development environment

- Use Node.js 20 or newer.
- The project uses ECMAScript modules and intentionally has no runtime dependencies.
- Run tests with `npm test`.
- Run the complete validation gate with `npm run check`.

`npm run check` syntax-checks the CLI and GitHub Action and runs the Node test suite. Do not report a
change as complete while this command is failing.

## Core contracts

Preserve these behaviors unless a reviewed decision explicitly changes them:

- `narrative init` creates missing standard files without overwriting existing configuration or
  preamble content.
- `narrative validate` validates fragment schema and content.
- `narrative compile` deterministically regenerates the configured output from fragments.
- `narrative check` fails when fragments are invalid or the compiled output is stale.
- Fragment order is derived from date and filename, not filesystem enumeration order.
- Fragment slugs are durable identities; displayed entry numbers are derived.
- A fragment contains front matter plus non-empty Context, Decision, and Consequences sections in
  that exact order.
- Summaries respect the configured character limit without cutting a word or sentence carelessly.
- The maintenance action ignores unmerged or unlabelled pull requests without fabricating entries.
- A qualifying merged pull request missing any required narrative section fails visibly.
- The action creates or force-updates `automation/narrative-pr-<number>` and opens a separate draft
  proposal rather than committing accepted history directly to the default branch.

Treat pull-request prose and event payloads as untrusted data. Do not execute PR content as shell
input. Prefer argument-array process execution such as `execFileSync` over interpolated shell
commands.

## Compatibility and security

- Keep the CLI dependency-free unless a material need is documented and reviewed.
- Preserve compatibility with the public inputs in `action.yml`.
- Treat `.project-narrative.json`, fragment front matter, section names, action inputs, output paths,
  and automation branch names as public interfaces.
- Add tests before changing parsing, validation, rendering, summarisation, or action behavior.
- Do not log GitHub tokens or put credentials in examples, fixtures, fragments, or generated output.
- The validation path must remain local, network-free, model-free, and deterministic.
- The maintenance action may use the GitHub API only for the documented branch and draft-PR flow.
- Keep action permissions at the least privilege documented for consumer repositories.

When changing a public contract, document migration or compatibility consequences in `README.md`.

## Testing expectations

Tests should cover the successful path and relevant rejection paths, including:

- malformed configuration and fragment front matter;
- invalid dates, slugs, kinds, status values, or duplicate slugs;
- missing, empty, duplicated, or reordered required sections;
- deterministic ordering and byte-identical compilation;
- stale-output detection;
- summary length and boundary behavior;
- merged, unmerged, labelled, and unlabelled pull-request events;
- safe handling of special characters and untrusted prose;
- reruns against an existing automation branch or draft proposal.

Before handing work back:

1. Run `npm run check`.
2. Run `git diff --check`.
3. Confirm the working tree contains only task-related changes.
4. Confirm examples and README instructions still match executable behavior.

Do not weaken validation or tests merely to make a change pass.

## Project Narrative requirements

Before opening or merging any pull request, classify the change.

A pull request requires Narrative evidence when it makes a meaningful:

- product decision;
- architecture decision;
- governance decision;
- operational decision;
- correction to an earlier decision or shipped behavior;
- experiment whose result should remain part of project memory.

For a decision-bearing pull request:

1. Apply the `narrative-required` label before merge.
2. Replace pull-request placeholders with substantive sections named exactly:
   - `## Narrative Context`
   - `## Narrative Decision`
   - `## Narrative Consequences`
3. Explain why the decision was required, what was chosen, material constraints or alternatives, and
   the resulting trade-offs.
4. Do not merge while the label or any required section is missing.

For a mechanical change that does not alter project intent:

- Do not apply `narrative-required`.
- Remove the three Narrative sections from the pull-request description.

In a consumer repository, the post-merge maintenance workflow uses that label and evidence to
propose a separate draft containing the fragment and regenerated `Narrative.md`. Never edit a
consumer's generated `Narrative.md` directly; edit its authoritative fragment and recompile.

Narrative-only proposal or repair pull requests must not carry `narrative-required`, because doing
so would recursively create an entry about maintaining the Narrative itself.

## Git and review discipline

- Preserve unrelated user changes.
- Keep commits and pull requests focused.
- Use descriptive commit messages.
- Do not commit secrets.
- Do not bypass required review or CI.
- Do not delete remote branches unless explicitly requested.
- Inspect the staged diff and verify checks before pushing.

If a requested action conflicts with these contracts, stop and explain the conflict instead of
silently weakening the processor.
