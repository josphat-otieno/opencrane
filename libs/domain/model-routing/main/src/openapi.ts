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

/** OpenAPI path fragments owned by the model-routing domain (composed into the control-plane spec). */
export const _ModelRoutingOpenapiPaths = {
  "/model-routing/defaults": {
    get: {
      operationId: "listModelRoutingDefaults",
      summary: "List model-routing defaults",
      tags: ["Model Registry"],
      parameters: [{ name: "clusterTenant", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning ClusterTenant." }],
      responses: {
        200: ok("Model-routing default list.", { type: "array", items: { $ref: "#/components/schemas/ModelRoutingDefault" } }),
      },
    },
    put: {
      operationId: "upsertModelRoutingDefault",
      summary: "Upsert the model-routing default for a (scope, clusterTenant) pair",
      tags: ["Model Registry"],
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/ModelRoutingDefaultWrite" } } },
      },
      responses: {
        200: ok("Model-routing default upserted.", { $ref: "#/components/schemas/ModelRoutingDefault" }),
        400: badRequest("Request body failed validation (code VALIDATION_ERROR)."),
        403: { description: "Caller is not authorized for the resource scope (code FORBIDDEN_SCOPE). Global defaults are operator-only.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },

  "/model-routing/defaults/{id}": {
    get: {
      operationId: "getModelRoutingDefault",
      summary: "Get a single model-routing default by id",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Model-routing default detail.", { $ref: "#/components/schemas/ModelRoutingDefault" }),
        404: notFound("Model routing default not found."),
      },
    },
    delete: {
      operationId: "deleteModelRoutingDefault",
      summary: "Delete a model-routing default",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Model-routing default deleted.", { type: "object", properties: { id: { type: "string" }, status: { type: "string" } } }),
        403: { description: "Caller is not authorized for the resource scope (code FORBIDDEN_SCOPE).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        404: notFound("Model routing default not found."),
      },
    },
  },

  "/model-routing/eval-cases": {
    get: {
      operationId: "listRoutingEvalCases",
      summary: "List routing eval cases",
      tags: ["Model Registry"],
      parameters: [
        { name: "skillName", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning skill name." },
        { name: "skillScope", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning skill scope." },
        { name: "skillTeam", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning skill team." },
      ],
      responses: {
        200: ok("Routing eval-case list.", { type: "array", items: { $ref: "#/components/schemas/RoutingEvalCase" } }),
      },
    },
    post: {
      operationId: "createRoutingEvalCase",
      summary: "Create a routing eval case for a skill",
      tags: ["Model Registry"],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RoutingEvalCaseWrite" } } } },
      responses: {
        201: created("Eval case created.", { $ref: "#/components/schemas/RoutingEvalCase" }),
        400: badRequest("Request body failed validation (code VALIDATION_ERROR)."),
        403: { description: "Caller is not authorized for the owning skill's scope (code FORBIDDEN_SCOPE). Org/global cases are operator-only.", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },

  "/model-routing/eval-cases/{id}": {
    get: {
      operationId: "getRoutingEvalCase",
      summary: "Get a single routing eval case by id",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Eval case detail.", { $ref: "#/components/schemas/RoutingEvalCase" }),
        404: notFound("Eval case not found."),
      },
    },
    put: {
      operationId: "updateRoutingEvalCase",
      summary: "Update a routing eval case by id",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RoutingEvalCaseWrite" } } } },
      responses: {
        200: ok("Eval case updated.", { $ref: "#/components/schemas/RoutingEvalCase" }),
        400: badRequest("Request body failed validation (code VALIDATION_ERROR)."),
        403: { description: "Caller is not authorized for the owning skill's scope (code FORBIDDEN_SCOPE).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        404: notFound("Eval case not found."),
      },
    },
    delete: {
      operationId: "deleteRoutingEvalCase",
      summary: "Delete a routing eval case by id",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Eval case deleted.", { type: "object", properties: { id: { type: "string" }, status: { type: "string" } } }),
        403: { description: "Caller is not authorized for the owning skill's scope (code FORBIDDEN_SCOPE).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        404: notFound("Eval case not found."),
      },
    },
  },

  "/model-routing/measurements": {
    get: {
      operationId: "listRoutingMeasurements",
      summary: "List shadow-savings measurements",
      tags: ["Model Registry"],
      parameters: [
        { name: "skillName", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning skill name." },
        { name: "skillScope", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning skill scope." },
        { name: "skillTeam", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning skill team." },
      ],
      responses: {
        200: ok("Measurement list.", { type: "array", items: { $ref: "#/components/schemas/RoutingMeasurement" } }),
      },
    },
  },

  "/model-routing/measurements/run": {
    post: {
      operationId: "runRoutingMeasurement",
      summary: "Trigger a shadow-savings measurement for a skill + candidate (operator-gated, best-effort)",
      tags: ["Model Registry"],
      requestBody: {
        required: true,
        content: { "application/json": { schema: {
          type: "object",
          required: ["skillName", "skillScope", "candidateModel"],
          properties: {
            skillName: { type: "string" },
            skillScope: { type: "string" },
            skillTeam: { type: "string", description: "Defaults to empty." },
            candidateModel: { type: "string", description: "The cheaper candidate model to evaluate." },
            currentModel: { type: "string", nullable: true, description: "Baseline model; resolved from the skill's pin when omitted." },
          },
        } } },
      },
      responses: {
        200: ok("Seams unconfigured — no-op; nothing recorded.", { type: "object", properties: { status: { type: "string" }, note: { type: "string" } } }),
        202: { description: "Measurement run completed; the persisted measurement (and proposalId when the savings CI excluded zero).", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, measurement: { $ref: "#/components/schemas/RoutingMeasurement" }, proposalId: { type: "string", nullable: true } } } } } },
        400: badRequest("Request body failed validation (code VALIDATION_ERROR)."),
        403: { description: "Caller is not a platform operator (code FORBIDDEN_SCOPE).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  },

  "/model-routing/measurements/{id}": {
    get: {
      operationId: "getRoutingMeasurement",
      summary: "Get a single measurement by id",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Measurement detail.", { $ref: "#/components/schemas/RoutingMeasurement" }),
        404: notFound("Measurement not found."),
      },
    },
  },

  "/model-routing/proposals": {
    get: {
      operationId: "listRoutingProposals",
      summary: "List routing-change proposals",
      tags: ["Model Registry"],
      parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: ["pending", "approved", "rejected", "applied"] }, description: "Filter by lifecycle status." }],
      responses: {
        200: ok("Proposal list.", { type: "array", items: { $ref: "#/components/schemas/RoutingProposal" } }),
      },
    },
  },

  "/model-routing/proposals/{id}": {
    get: {
      operationId: "getRoutingProposal",
      summary: "Get a single proposal by id",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Proposal detail.", { $ref: "#/components/schemas/RoutingProposal" }),
        404: notFound("Proposal not found."),
      },
    },
  },

  "/model-routing/proposals/{id}/approve": {
    post: {
      operationId: "approveRoutingProposal",
      summary: "Approve a proposal — pin the skill to the proposed model and mark it Applied",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Proposal applied.", { type: "object", properties: { id: { type: "string" }, status: { type: "string" }, appliedModel: { type: "string", nullable: true } } }),
        403: { description: "Caller is not authorized for the owning skill's scope (code FORBIDDEN_SCOPE).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        404: notFound("Proposal or target skill not found."),
        409: conflict("Proposal is no longer pending (code PROPOSAL_ALREADY_DECIDED)."),
      },
    },
  },

  "/model-routing/proposals/{id}/reject": {
    post: {
      operationId: "rejectRoutingProposal",
      summary: "Reject a proposal — flip status to Rejected; the skill posture is untouched",
      tags: ["Model Registry"],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Proposal rejected.", { type: "object", properties: { id: { type: "string" }, status: { type: "string" }, appliedModel: { type: "string", nullable: true } } }),
        403: { description: "Caller is not authorized for the owning skill's scope (code FORBIDDEN_SCOPE).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        404: notFound("Proposal not found."),
        409: conflict("Proposal is no longer pending (code PROPOSAL_ALREADY_DECIDED)."),
      },
    },
  },

  "/model-routing/recommendations": {
    get: {
      operationId: "listSavingsRecommendations",
      summary: "List savings recommendations (latest measurement + any open proposal, per skill)",
      tags: ["Model Registry"],
      parameters: [
        { name: "clusterTenant", in: "query", required: false, schema: { type: "string" }, description: "Filter to skills owned by this ClusterTenant (the skill's team)." },
        { name: "skillScope", in: "query", required: false, schema: { type: "string" }, description: "Filter to one owning skill scope." },
        { name: "onlyOpen", in: "query", required: false, schema: { type: "string", enum: ["true"] }, description: "When 'true', return only skills with an open Pending proposal." },
      ],
      responses: {
        200: ok("Recommendations sorted by projected savings desc; scope-filtered to the caller's ClusterTenant for non-operators.", { type: "array", items: { $ref: "#/components/schemas/SavingsRecommendation" } }),
      },
    },
  },

  "/model-routing/metrics": {
    get: {
      operationId: "getRoutingMetrics",
      summary: "Proxy a metrics query to the self-hosted Langfuse backend (server-side auth; non-operators scoped to their tenant)",
      tags: ["Model Registry"],
      parameters: [
        { name: "query", in: "query", required: false, schema: { type: "string" }, description: "Langfuse v1 metrics `query` JSON, forwarded verbatim (a tenant filter is injected for non-operators)." },
      ],
      responses: {
        200: ok("Upstream Langfuse metrics JSON (loosely-typed passthrough).", { type: "object", additionalProperties: true }),
        403: { description: "A non-operator caller with no resolved ClusterTenant has no metrics scope (code FORBIDDEN_SCOPE).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        502: { description: "The Langfuse backend was unreachable or returned a non-2xx status.", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, error: { type: "string" } } } } } },
        503: { description: "The Langfuse backend is not configured (host/keys missing).", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" } } } } } },
      },
    },
  },
};
