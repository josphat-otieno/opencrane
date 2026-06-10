---
description: Execute scoped roadmap items from plan.md into validated, PR-ready changes while keeping plan.md accurate.
argument-hint: "[target plan section / phase] [constraints] [PR expectations]"
---

You are executing the OpenCrane roadmap. Turn roadmap items in `plan.md` into
implemented, validated code changes while keeping the plan document accurate.

Target / constraints from the caller: **$ARGUMENTS**
(If empty, ask which plan section or phase to target before implementing anything.)

## First — load the rules

Read `AGENTS.md` at the repository root before writing any code. It is the canonical
rule set (coding conventions, IAM-first policy, planning discipline, commit format).

## Scope

- Execute concrete implementation tasks from `plan.md` that fit in the current cycle.
- Default to completing all unchecked items in the selected target phase, unless an
  item is blocked by a missing decision or external dependency.
- Update `plan.md` status/checklists in the **same cycle** as the code and validation.
- Prepare PR-ready deliverables: change summary, validation evidence, risk notes,
  commit message proposal, and a publishable PR body.

## Constraints

- Do not treat strategic roadmap statements as automatically implementable. Only
  implement scoped items with clear acceptance criteria.
- Treat unresolved architecture-checkpoint questions in `plan.md` as **blockers** —
  do not guess hidden product decisions.
- Do not mark items complete in `plan.md` without code **and** validation evidence.
- Never push directly to the default branch or rewrite shared history. Branch first.
- Never revert unrelated user changes.

## Procedure

1. Parse the target section(s) of `plan.md`; extract actionable items with their
   dependencies and success criteria.
2. Build a short execution plan that prioritises the smallest high-impact shippable slice.
3. Implement the selected slice(s), including tests and any required docs/config updates,
   following AGENTS.md conventions as you write — not as a cleanup pass afterwards.
4. Run the validation commands relevant to the changed packages (e.g.
   `pnpm --filter @opencrane/<pkg> test`, `pnpm build`). Summarise pass/fail evidence.
5. If an unresolved roadmap decision blocks an item, stop that item, record the evidence,
   and continue with unblocked items in the same phase.
6. Update the `plan.md` checklist/state to reflect exactly what changed this cycle.
7. **Delegate a review pass to the `review` subagent** against the changed files.
   Resolve Critical/High findings before producing PR output.
8. Create/update a feature branch and commit when the caller wants a PR; then open it.

## Output (return in this order)

1. **Implemented items**
2. **Validation** — commands run and pass/fail evidence
3. **plan.md updates** — exactly what state changed
4. **PR status** — URL if created, or exact creation commands + PR body if blocked
5. **Review findings summary** — from the review subagent, with resolution status
6. **Suggested commit message** — gitmoji + imperative subject under 72 chars

If blocked instead, return: **Blocker**, **Evidence**, **Proposed unblocking options**,
**Minimal fallback slice**.
