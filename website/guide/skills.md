# Add skills

**Skills** are reusable capabilities you publish once and share with assistants
across the organization. OpenCrane keeps them in your own registry, scans them for
safety, and delivers only what each assistant is entitled to.

## Publish a skill

```bash
oc skills publish ./my-skill        # add to the catalog (scanned on ingest)
oc skills list                      # see the catalog
```

Every skill is scanned (Grype/Trivy) before it can be published, so unsafe bundles
never reach an assistant.

## Share across the org

Promote a skill up through the scopes — from one person, to a project, to a
department, to the whole organization (and demote the same way):

```bash
oc skills promote my-skill --to department
oc skills demote  my-skill --to project
```

An assistant only ever receives the skills it's entitled to (see
[Control access](/guide/permissions)). Skills are delivered on demand and pinned by
digest, so rollouts are consistent and reversible.

## Learn more

The delivery internals — entitlement checks, scan pipeline, and per-read delivery —
are covered in [Skill registry & delivery](/integrators/skill-registry).
