-- Migration 0013: Downstream-credential brokering mode for MCP credentials (P4D.1)
--
-- Adds a brokering strategy to each MCP credential so the gateway plane (Obot)
-- can distinguish per-user RFC 8693 token exchange (OBO) from a static
-- per-tenant/per-server secret fallback for non-OBO upstreams. Custody is
-- unchanged: secret material is held by the gateway plane, never the pod.
--
-- Additive + backward-compatible: existing rows default to static_fallback,
-- and secret_ref is relaxed to nullable so OBO credentials carry no static
-- secret.

-- 1. Brokering mode enum (DB values mirror the @map labels in schema.prisma).
CREATE TYPE "McpCredentialBrokeringMode" AS ENUM ('static_fallback', 'per_user_obo');

-- 2. New column on the credential table; existing rows keep their static secret.
ALTER TABLE "mcp_server_credentials"
  ADD COLUMN "brokering_mode" "McpCredentialBrokeringMode" NOT NULL DEFAULT 'static_fallback';

-- 3. Relax secret_ref to nullable — OBO credentials author no static secret.
ALTER TABLE "mcp_server_credentials"
  ALTER COLUMN "secret_ref" DROP NOT NULL;
