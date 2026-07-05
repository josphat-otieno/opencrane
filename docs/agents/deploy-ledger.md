# Deploy ledger — the fleet's memory

Append-only log of deploy runs and what they taught us. The `deploy` agent reads this
**before every run** (so no lesson is rediscovered) and appends after every run. The
`/deploy-loop` skill mines it for configuration-simplification candidates: any friction
item seen in **2+ runs** graduates to a fix PR or an issue.

Keep entries terse — this file is loaded into agent context every run. When a lesson is
fixed at the source (chart/script/docs), rewrite its line to a one-line pointer
(`fixed → PR #NNN`) instead of letting dead advice accumulate. Full run reports do NOT
belong here; they live in the run's PR/issue.

## Format (append one block per run)

```
## <date> · <env> · <profile> · <sha> · <LIVE|PARTIAL|FAILED>
- findings: <class>: one line each, with PR/issue link once filed
- friction: one line each (these accumulate into simplification counters)
- lesson: what the next run must know (flags, ordering, gotchas)
```

## Simplification counters

Friction items seen across runs; bump the count, and when it hits 2, file the fix.

| Friction item | Seen | Status |
|---|---|---|
| _(none yet)_ | | |

## Standing lessons (read these first)

- Dependencies resolve from `Chart.lock` via `helm dep build` — never `dep update`
  during a deploy (reproducibility; see PR #97).
- Values presets live in `libs/k8s-platform/values/` (`opencrane-dev.yaml` is the dev
  cluster). New env knobs belong in a preset, not in one-off `--set` flags.
- Known dev-cluster history (see auto-memory / plan.md): migrate-on-deploy
  initContainer, tenant-pod `trustNothing` config crash, `trustedProxies: []`
  fail-closed — check whether a "new" failure is one of these before diagnosing fresh.

## Runs

_(no runs recorded yet — first `/deploy-loop` run appends here)_
