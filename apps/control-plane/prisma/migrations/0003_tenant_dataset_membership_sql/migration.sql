-- CreateTable
CREATE TABLE "tenant_dataset_memberships" (
    "tenant" TEXT NOT NULL,
    "org" TEXT[] NOT NULL DEFAULT ARRAY['default']::TEXT[],
    "team" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "project" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "personal" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_dataset_memberships_pkey" PRIMARY KEY ("tenant")
);

-- AddForeignKey
ALTER TABLE "tenant_dataset_memberships"
ADD CONSTRAINT "tenant_dataset_memberships_tenant_fkey"
FOREIGN KEY ("tenant") REFERENCES "tenants"("name")
ON DELETE CASCADE
ON UPDATE CASCADE;
