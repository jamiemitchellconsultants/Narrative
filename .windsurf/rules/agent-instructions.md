---
trigger: always_on
---

Before planning, editing, reviewing, opening, or merging a pull request, read and follow the
repository-root `AGENTS.md` in full. Every rule there is binding, regardless of which AI tool is
being used.

`AGENTS.md` is the authoritative project-wide instruction file and the single source of truth. This
file, and the equivalent files for other tools (`CLAUDE.md`, `.github/copilot-instructions.md`,
`GEMINI.md`, `.cursor/rules/`, `.clinerules/`), are thin pointers to it — kept that way deliberately
so the rules never have to be kept in sync across multiple copies. If you are updating the
instructions, edit `AGENTS.md`, not this file.

Note in particular the "Project Narrative requirements" section: classify every pull request, and
before merging a decision-bearing change apply the `narrative-required` label together with these
pull-request body sections:

- `## Narrative Context`
- `## Narrative Decision`
- `## Narrative Consequences`

A narrative-only pull request must not carry the label, or it would recursively generate an entry
about maintaining the narrative.
