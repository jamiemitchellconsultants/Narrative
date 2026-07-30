---
date: 2026-07-30
slug: make-the-never-hand-merge-rule-explicit-in-the-core-contracts
title: "Make the never-hand-merge rule explicit in the core contracts"
summary: "State that the compiled output is never authored, hand-edited, or hand-merged — in this repository or any consumer's — and that the only file written by hand is a fragment under the configured fragments directory."
kind: product
status: accepted
sequence: 2026-07-30T05:24:42.000Z
evidence: "https://github.com/jamiemitchellconsultants/Narrative/pull/17; merge commit 675530e9ae9150ab35b8e024abdee19ae7fb043b"
---

## Context

`AGENTS.md` said: "Never edit a consumer's generated `Narrative.md` directly; edit its authoritative fragment and recompile." Correct, and silent on the case that arose in practice.

A consumer repository hit a conflict between an automation-proposed entry and a hand-written one. The fragments merged cleanly — entries are separate files and the two sides added disjoint ones — and only the compiled projection collided. The existing rule forbids *editing* the compiled file but says nothing about *resolving a conflict* in it, and hand-reconciling the markers reads as a different activity from editing. It would have produced an index and entry numbering that the next compile discards, with no signal that anything was lost.

The rule also did not record *why* it is safe. The reason the correct resolution is always "discard both sides and recompile" is that compilation is deterministic and model-free: the output is a function of the fragments and nothing else. That property is what makes the projection disposable, and it was documented as a testing expectation without being connected to this rule.

## Decision

State that the compiled output is never authored, hand-edited, or hand-merged — in this repository or any consumer's — and that the only file written by hand is a fragment under the configured fragments directory.

Name the conflict case explicitly: when two branches each add an entry, the projection collides while the fragments merge, and the resolution is to discard both sides of the projection and recompile rather than reconcile the markers.

Add the instruction to preserve the property the rule rests on: a change that made compilation non-deterministic, or that made the compiled file meaningful to hand-merge, breaks this guarantee. That puts it alongside the other core contracts rather than leaving it as advice, so the reason the rule holds is as durable as the rule.

## Consequences

The correct conflict resolution is now written down where an agent developing the processor will read it, and the guarantee it depends on is stated as a contract rather than implied by the test list.

Nothing about the processor changes — `npm run check` passes 13/13 and no CLI, action, validation, or rendering behaviour is touched. The addition is a constraint on future changes: making the projection non-deterministic is now visibly a contract break rather than a quality regression.

This does not remove the conflict itself. Any consumer whose narrative pull requests overlap with an open proposal will still collide on the compiled file; the rule makes the resolution unambiguous rather than preventing the collision. Preventing it would mean not committing generated output at all, which is a different convention some consumers already use and this repository does not impose.
