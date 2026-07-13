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

function ok(description: string, schema: object)
{
  return {
    description,
    content: { "application/json": { schema } },
  };
}

/** OpenAPI path fragments owned by the sessions domain (composed into the control-plane spec). */
export const _SessionsOpenapiPaths = {
  "/sessions/{sessionKey}/scope": {
    get: {
      operationId: "getSessionScope",
      summary: "Inspect a chat-window session's awareness scope binding",
      tags: ["Sessions"],
      parameters: [{ name: "sessionKey", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Current session scope binding.", { $ref: "#/components/schemas/SessionScope" }),
        404: notFound("Session scope not found."),
      },
    },
    put: {
      operationId: "setSessionScope",
      summary: "Bind a session scope (CP intersects with the principal's entitlements)",
      tags: ["Sessions"],
      parameters: [{ name: "sessionKey", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["principal", "scopes"],
              properties: {
                principal: { type: "string" },
                scopes: { type: "array", items: { $ref: "#/components/schemas/ScopeSelector" } },
              },
            },
          },
        },
      },
      responses: {
        200: ok("Authorised binding; `rejected` lists any over-scope dropped.", {
          allOf: [
            { $ref: "#/components/schemas/SessionScope" },
            { type: "object", properties: { rejected: { type: "array", items: { $ref: "#/components/schemas/ScopeSelector" } } } },
          ],
        }),
        400: badRequest("Missing principal or empty scopes."),
        403: { description: "None of the requested scopes are entitled (over-scope).", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    delete: {
      operationId: "clearSessionScope",
      summary: "Clear a session's scope binding",
      tags: ["Sessions"],
      parameters: [{ name: "sessionKey", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: ok("Binding cleared.", { type: "object", properties: { sessionKey: { type: "string" }, cleared: { type: "boolean" } } }),
        404: notFound("Session scope not found."),
      },
    },
  },
};
