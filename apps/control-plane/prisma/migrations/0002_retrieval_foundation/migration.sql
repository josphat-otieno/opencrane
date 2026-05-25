-- CreateTable
CREATE TABLE "org_documents" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "team_scope" TEXT,
    "sensitivity_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "content" TEXT NOT NULL,
    "content_hash" TEXT,
    "embedding_ready" BOOLEAN NOT NULL DEFAULT false,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvesting_cursors" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "cursor_value" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harvesting_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_documents_source_source_id_key" ON "org_documents"("source", "source_id");

-- CreateIndex
CREATE INDEX "org_documents_source_idx" ON "org_documents"("source");

-- CreateIndex
CREATE INDEX "org_documents_owner_idx" ON "org_documents"("owner");

-- CreateIndex
CREATE INDEX "org_documents_team_scope_idx" ON "org_documents"("team_scope");

-- CreateIndex
CREATE UNIQUE INDEX "harvesting_cursors_source_key" ON "harvesting_cursors"("source");
