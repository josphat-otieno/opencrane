-- Migration 0022: MCP operator API — catalogue / credential-connect / activation
-- + admin governance (P1).
--
-- Layers the consumption + governance surface the WeOwnAI frontend targets on top
-- of the existing /mcp-servers admin registry. Additive + backward-compatible:
-- existing servers default to server_type='single-user', approval_status='pending-review',
-- and an empty credential_schema, so nothing already registered changes behaviour.
-- Secret custody is unchanged: per-user installs carry only a write-only credential_ref
-- handle (the gateway plane / Obot holds the material), never serialised by any response.

-- 1. Closed-set enums (DB values mirror the @map labels in schema.prisma).
CREATE TYPE "McpServerType" AS ENUM ('single-user', 'multi-user', 'remote-oauth');
CREATE TYPE "McpApprovalStatus" AS ENUM ('pending-review', 'approved', 'published', 'disabled');
CREATE TYPE "McpConnectionStatus" AS ENUM ('needs-credential', 'activating', 'connected', 'oauth-connected', 'shared-key', 'activation-failed');

-- 2. Extend the server catalogue row with consumption + governance metadata.
ALTER TABLE "mcp_servers"
  ADD COLUMN "publisher"           TEXT,
  ADD COLUMN "glyph"               TEXT,
  ADD COLUMN "server_type"         "McpServerType" NOT NULL DEFAULT 'single-user',
  ADD COLUMN "approval_status"     "McpApprovalStatus" NOT NULL DEFAULT 'pending-review',
  ADD COLUMN "credential_schema"   JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "entitlement_summary" TEXT;

CREATE INDEX "mcp_servers_approval_status_idx" ON "mcp_servers" ("approval_status");

-- 3. Per-user install records. credential_ref is a write-only custody handle; the
--    unique pair keeps a caller to one install per server.
CREATE TABLE "mcp_server_installs" (
  "id"                TEXT NOT NULL,
  "mcp_server_id"     TEXT NOT NULL,
  "user_id"           TEXT NOT NULL,
  "connection_status" "McpConnectionStatus" NOT NULL DEFAULT 'needs-credential',
  "credential_ref"    TEXT,
  "connected_account" TEXT,
  "last_used_at"      TIMESTAMP(3),
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mcp_server_installs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mcp_server_installs_mcp_server_id_user_id_key" ON "mcp_server_installs" ("mcp_server_id", "user_id");
CREATE INDEX "mcp_server_installs_user_id_idx" ON "mcp_server_installs" ("user_id");
ALTER TABLE "mcp_server_installs"
  ADD CONSTRAINT "mcp_server_installs_mcp_server_id_fkey" FOREIGN KEY ("mcp_server_id") REFERENCES "mcp_servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Per-server access policy (one row per server). everyone_in_org short-circuits
--    the per-user / per-group entitlement lists.
CREATE TABLE "mcp_server_access_policies" (
  "id"              TEXT NOT NULL,
  "mcp_server_id"   TEXT NOT NULL,
  "everyone_in_org" BOOLEAN NOT NULL DEFAULT false,
  "groups"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mcp_server_access_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mcp_server_access_policies_mcp_server_id_key" ON "mcp_server_access_policies" ("mcp_server_id");
ALTER TABLE "mcp_server_access_policies"
  ADD CONSTRAINT "mcp_server_access_policies_mcp_server_id_fkey" FOREIGN KEY ("mcp_server_id") REFERENCES "mcp_servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Per-user entitlement rows attached to a policy (child of the policy, not a
--    String[]) so a caller's entitlement can be looked up without scanning.
CREATE TABLE "mcp_server_access_users" (
  "id"               TEXT NOT NULL,
  "access_policy_id" TEXT NOT NULL,
  "user_id"          TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_server_access_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mcp_server_access_users_access_policy_id_user_id_key" ON "mcp_server_access_users" ("access_policy_id", "user_id");
CREATE INDEX "mcp_server_access_users_user_id_idx" ON "mcp_server_access_users" ("user_id");
ALTER TABLE "mcp_server_access_users"
  ADD CONSTRAINT "mcp_server_access_users_access_policy_id_fkey" FOREIGN KEY ("access_policy_id") REFERENCES "mcp_server_access_policies" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
