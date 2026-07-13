// Common response helpers
function notFound(description: string)
{
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

function badRequest(description: string)
{
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

function conflict(description: string)
{
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

function ok(description: string, schema: object)
{
  return {
    description,
    content: { "application/json": { schema } },
  };
}

function created(description: string, schema: object)
{
  return {
    description,
    content: { "application/json": { schema } },
  };
}

const AutoRoutingConfigSchema = {
  type: "object" as const,
  required: ["objective", "sessionPin", "explorationRate"],
  description: "Opt-in auto-routing configuration. Auto routing applies ONLY when a skill (or scope default) selects it; the runtime optimizer that consumes it is a later track item (AIR.7).",
  properties: {
    objective: { type: "string", enum: ["cheapest-passing-bar", "best-quality-within-budget", "balanced"], description: "The optimization objective." },
    costQualitySlider: { type: "number", description: "Cost↔quality dial for the balanced objective: 0 = cheapest … 10 = best." },
    qualityFloor: { type: "number", description: "Minimum eval score a model must clear; defaults to the skill's own bar when omitted." },
    maxBudgetUsd: { type: "number", description: "Hard per-decision spend ceiling in USD." },
    allowedModels: { type: "array", items: { type: "string" }, description: "Restrict auto to this subset of publicModelNames; must stay within the key's allowlist." },
    latencyCeilingMs: { type: "number", description: "Reject/penalize models slower than this many milliseconds." },
    fallbacks: { type: "array", items: { type: "string" }, description: "Ordered fallback publicModelNames on failure/unavailability." },
    sessionPin: { type: "boolean", description: "Keep the chosen model stable within a conversation to preserve prompt caches." },
    explorationRate: { type: "number", minimum: 0, maximum: 1, description: "Fraction of traffic to explore alternatives on (0 = pure exploit)." },
  },
};

/** OpenAPI path fragments owned by the skills domain (composed into the opencrane-ui spec). */
export const _SkillsOpenapiPaths = {
  "/skills/catalog": {
    get: {
      operationId: "listSkillBundles",
      summary: "List all skill bundles with entitlements and promotion history",
      tags: ["Skills"],
      responses: {
        200: ok("Skill bundle list.", { type: "array", items: { $ref: "#/components/schemas/SkillBundle" } }),
      },
    },
    post: {
      operationId: "createSkillBundle",
      summary: "Create a new skill bundle",
      tags: ["Skills"],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", required: ["name", "version", "digest", "scope"] } } },
      },
      responses: {
        201: created("Skill bundle created.", { type: "object", properties: { id: { type: "string" }, status: { type: "string" } } }),
      },
    },
  },

  "/skills/catalog/backfill": {
    post: {
      operationId: "backfillSkillBundlesToOci",
      summary: "Backfill all published bundles' content into the OCI store (P4D.2)",
      tags: ["Skills"],
      responses: {
        200: ok("Backfill summary with per-bundle outcomes.", {
          type: "object",
          required: ["total", "pushed", "skipped", "failed", "results"],
          properties: {
            total: { type: "integer", description: "Published bundles considered." },
            pushed: { type: "integer", description: "Count pushed to the registry." },
            skipped: { type: "integer", description: "Count skipped (no DB content)." },
            failed: { type: "integer", description: "Count failed (push error or digest mismatch)." },
            results: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "name", "digest", "outcome"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  digest: { type: "string" },
                  outcome: { type: "string", enum: ["pushed", "skipped", "failed"] },
                  reason: { type: "string", description: "Failure detail when outcome is failed." },
                },
              },
            },
          },
        }),
        409: conflict("OCI store not configured (SKILL_OCI_REGISTRY_URL unset)."),
      },
    },
  },

  "/skills/catalog/{id}": {
    get: {
      operationId: "getSkillBundle",
      summary: "Get a single skill bundle by identifier",
      tags: ["Skills"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Skill bundle detail.", { $ref: "#/components/schemas/SkillBundle" }),
        404: notFound("Skill bundle not found."),
      },
    },
    put: {
      operationId: "updateSkillBundle",
      summary: "Update a skill bundle and fully replace entitlements and promotions",
      tags: ["Skills"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object" } } },
      },
      responses: {
        200: ok("Skill bundle updated.", { type: "object", properties: { id: { type: "string" }, status: { type: "string" } } }),
      },
    },
    delete: {
      operationId: "deleteSkillBundle",
      summary: "Delete a skill bundle and its linked entitlement grants",
      tags: ["Skills"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Skill bundle deleted.", { type: "object", properties: { id: { type: "string" }, status: { type: "string" } } }),
      },
    },
  },

  "/skills/posture": {
    get: {
      operationId: "listSkillModelPostures",
      summary: "List all skills with their model posture",
      tags: ["Skills"],
      responses: {
        200: ok("Skill posture list.", { type: "array", items: { $ref: "#/components/schemas/SkillModelPosture" } }),
      },
    },
  },

  "/skills/posture/skill": {
    get: {
      operationId: "getSkillModelPosture",
      summary: "Get a single skill's model posture by its compound key",
      tags: ["Skills"],
      parameters: [
        { name: "name", in: "query", required: true, schema: { type: "string" }, description: "Skill name." },
        { name: "scope", in: "query", required: true, schema: { type: "string" }, description: "Skill scope." },
        { name: "team", in: "query", required: false, schema: { type: "string" }, description: "Owning team; empty string when not team-scoped." },
      ],
      responses: {
        200: ok("Skill posture detail.", { $ref: "#/components/schemas/SkillModelPosture" }),
        400: badRequest("name and scope query params are required (code VALIDATION_ERROR)."),
        404: notFound("Skill not found."),
      },
    },
    put: {
      operationId: "setSkillModelPosture",
      summary: "Set (or clear) a skill's model posture",
      tags: ["Skills"],
      parameters: [
        { name: "name", in: "query", required: true, schema: { type: "string" }, description: "Skill name." },
        { name: "scope", in: "query", required: true, schema: { type: "string" }, description: "Skill scope." },
        { name: "team", in: "query", required: false, schema: { type: "string" }, description: "Owning team; empty string when not team-scoped." },
      ],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/SkillModelPostureWrite" } } },
      },
      responses: {
        200: ok("Skill posture updated.", { $ref: "#/components/schemas/SkillModelPosture" }),
        400: badRequest("Request body or query failed validation (code VALIDATION_ERROR)."),
        403: { description: "Caller is not authorized for the resource scope (code FORBIDDEN_SCOPE). Org/global skills are operator-only.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        404: notFound("Skill not found."),
      },
    },
  },
};
