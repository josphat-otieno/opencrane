---
description: Execute scoped roadmap items from plan.md into validated, committed changes while keeping plan.md accurate.
argument-hint: "[target plan section / phase] [constraints]"
---

You are executing the OpenCrane roadmap. Turn roadmap items in `plan.md` into
implemented, validated code changes while keeping the plan document accurate.

Target / constraints from the caller: **$ARGUMENTS**
(If empty, ask which plan section or phase to target before implementing anything.)

## First — load the rules

Read `AGENTS.md` at the repository root before writing any code. It is the canonical
rule set (coding conventions, IAM-first policy, planning discipline, commit format).

## Efficiency rules (follow these to avoid slow sessions)

- **Do not re-read the full plan.md.** Read only the "Open Backlog (Execute Next)"
  section (grep for the section header, then read that block). The rest is history.
- **Act at the first clear signal.** Do not spend multiple rounds investigating before
  touching files. If the item has acceptance criteria and file anchors, start immediately.
- **One build + test cycle per slice.** Do not run redundant validation rounds.
  If build passes and tests pass, that is the evidence — move on.
- **Report blockers immediately.** If an item is blocked (missing decision, missing
  tooling, BLOCKED annotation in plan), record it and skip to the next item.
  Do not investigate the blocker further unless explicitly asked.

## Scope

- Execute concrete implementation tasks from `plan.md` that fit in the current cycle.
- Default to completing all unchecked items in the selected target phase, unless an
  item is blocked by a missing decision or external dependency.
- Update `plan.md` status/checklists in the **same cycle** as the code and validation.

## Constraints

- Do not treat strategic roadmap statements as automatically implementable. Only
  implement scoped items with clear acceptance criteria.
- Treat unresolved architecture-checkpoint questions in `plan.md` as **blockers** —
  do not guess hidden product decisions.
- Do not mark items complete in `plan.md` without code **and** validation evidence.
- **Do NOT commit, push, or open pull requests.** Leave changes staged or unstaged.
  The user handles all git operations themselves.
- Never push directly to the default branch or rewrite shared history.
- Never revert unrelated user changes.

## Procedure

1. Read only the "Open Backlog (Execute Next)" section of `plan.md`. Extract the
   first N unblocked items with clear acceptance criteria.
2. Pick the smallest high-impact slice. State what you are going to implement in
   one sentence, then implement it without further discussion.
3. Implement the selected slice(s), including tests and any required docs/config
   updates, following AGENTS.md conventions as you write — not as a cleanup pass.
4. Run `pnpm build` and the relevant test filter(s). One cycle. Summarise pass/fail.
5. If a blocker is hit, record it in plan.md and move to the next unblocked item.
6. Update the `plan.md` checklist/state to reflect exactly what changed this cycle.
7. **Delegate a review pass to the `review` subagent** against the changed files.
   Resolve Critical/High findings before finishing.
8. Leave the changes in the working tree. Do NOT commit, push, or open a PR.

## Output (return in this order)

1. **Implemented items** — one bullet per completed item with acceptance criterion met
2. **Validation** — build and test pass/fail evidence (commands + result)
3. **plan.md updates** — exactly which items changed state
4. **Blockers** — items skipped and why (BLOCKED annotation, missing tooling, etc.)
5. **Review findings summary** — from the review subagent, with resolution status
6. **Suggested commit message** — gitmoji + imperative subject under 72 chars

If fully blocked: **Blocker**, **Evidence**, **Proposed unblocking options**, **Minimal fallback slice**.
