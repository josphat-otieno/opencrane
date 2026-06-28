-- Migration 0031: add tenant_litellm_keys table.
-- LiteLLM virtual keys are issued per tenant and tracked here for revocation and auditing.
-- The `issued_at` field is required and has no default — callers must always supply it.

CREATE TABLE "tenant_litellm_keys" (
    "id"                  TEXT NOT NULL,
    "tenant"              TEXT NOT NULL,
    "key_alias"           TEXT NOT NULL,
    "secret_name"         TEXT NOT NULL,
    "monthly_budget_usd"  DECIMAL(12,2),
    "issued_at"           TIMESTAMP(3) NOT NULL,
    "revoked_at"          TIMESTAMP(3),
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_litellm_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_litellm_keys_tenant_idx" ON "tenant_litellm_keys"("tenant");
CREATE INDEX "tenant_litellm_keys_tenant_revoked_at_idx" ON "tenant_litellm_keys"("tenant", "revoked_at");

ALTER TABLE "tenant_litellm_keys" ADD CONSTRAINT "tenant_litellm_keys_tenant_fkey"
    FOREIGN KEY ("tenant") REFERENCES "tenants"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
