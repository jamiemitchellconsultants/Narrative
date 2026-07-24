# Installing Project Narrative (agent instructions)

This file is written for a **coding agent installing Project Narrative into a consumer repository**
on a user's behalf — the typical trigger is a user saying *"add jamiemitchellconsultants/narrative to
this repo."* It is deliberately distinct from `AGENTS.md`, which governs developing this processor
itself. Follow the steps here in order and do not improvise the processor contract.

Project Narrative is a deterministic, review-first decision-history processor. It never invents
rationale from code or diffs. Your job is to scaffold the integration, not to author narrative
content.

## What one command does

From the root of the consumer repository, with Node.js 20 or newer:

```bash
npx --yes --package=github:jamiemitchellconsultants/Narrative narrative install
```

`narrative install` is non-destructive — it never overwrites an existing file — and it deterministically
scaffolds:

- `.project-narrative.json` — configuration (only if missing)
- `narrative/preamble.md` — hand-authored preamble (only if missing)
- `Narrative.md` — the compiled projection (do not hand-edit afterwards)
- `.github/workflows/maintain-narrative.yml` — post-merge capture on labelled, merged PRs
- `.github/workflows/validate-narrative.yml` — deterministic PR validation
- `.github/pull_request_template.md` — the three narrative sections the processor consumes

The command prints each path as `created` or `kept`, followed by the manual follow-ups below. Relay
those follow-ups to the user verbatim — they are the only steps the CLI cannot perform.

If the repository already has a `.github/pull_request_template.md`, the command keeps it untouched.
In that case, surface to the user that the existing template must gain three exact headings —
`## Narrative Context`, `## Narrative Decision`, `## Narrative Consequences` — or labelled PRs will
fail visibly. Do not silently overwrite their template.

## Manual follow-ups you must surface (the CLI cannot do these)

These require repository-admin actions through the GitHub UI or API; the scaffolding cannot perform
them and must not be reported as done:

1. **Enable workflow PR creation.** Settings → Actions → General → Workflow permissions: select
   **Read and write permissions** and enable **Allow GitHub Actions to create and approve pull
   requests**. Without this the maintenance run pushes its branch but the draft-PR call returns
   HTTP 403.
2. **Create the trigger label** named exactly `narrative-required`. Only merged PRs carrying it are
   captured; mechanical PRs stay unlabelled and are ignored.
3. **Commit and merge the scaffolded files to the default branch** before the first decision
   capture. Workflows only run from files already present on the default branch.

## Verification

After scaffolding, run the deterministic gate to confirm a valid initial state:

```bash
npx --yes --package=github:jamiemitchellconsultants/Narrative narrative check
```

A zero exit code means fragments are valid and `Narrative.md` is not stale. Report the result
honestly; do not weaken validation to make it pass.

## What you must NOT do

- Do not hand-edit `Narrative.md`; it is a projection of the fragments under `narrative/entries/`.
  To change wording, edit the fragment and run `narrative compile`.
- Do not add the `narrative-required` label to the installation PR itself. Installing the processor
  is a mechanical change; labelling it would recursively create an entry about the tooling.
- Do not invent Context, Decision, or Consequences content. Those are authored by a human in the PR
  body; the processor only captures explicit evidence.
- Do not change the three section heading names or the label spelling — they are public interfaces.

## Pinning

The scaffolded workflows reference `jamiemitchellconsultants/Narrative@main`, which receives updates
immediately. For stricter supply-chain control, offer to replace `@main` with a reviewed tag or
commit SHA in both workflow files.
