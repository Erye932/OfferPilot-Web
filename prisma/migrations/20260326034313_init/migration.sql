-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'anonymous',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnose_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "target_role" TEXT NOT NULL,
    "jd_text" TEXT,
    "resume_text" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'paste',
    "jd_quality" TEXT,
    "input_quality" TEXT,
    "scenario" TEXT NOT NULL DEFAULT 'normal',
    "schema_version" TEXT NOT NULL DEFAULT '1.0',
    "tier" TEXT NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnose_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnose_reports" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "main_judgment" TEXT NOT NULL,
    "report_json" JSONB NOT NULL,
    "model_name" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnose_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "page_count" INTEGER,
    "extracted_text_length" INTEGER,
    "parse_status" TEXT NOT NULL DEFAULT 'success',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action_type" TEXT NOT NULL,
    "quota_type" TEXT NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_sources" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "raw_text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corpus_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_documents" (
    "id" TEXT NOT NULL,
    "source_id" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "issue_type" TEXT,
    "role_tag" TEXT,
    "scenario_tag" TEXT,
    "content" TEXT NOT NULL,
    "example_before" TEXT,
    "example_after" TEXT,
    "risk_level" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" TEXT NOT NULL DEFAULT '1.0',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "corpus_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "diagnose_sessions_created_at_idx" ON "diagnose_sessions"("created_at");

-- CreateIndex
CREATE INDEX "diagnose_sessions_scenario_idx" ON "diagnose_sessions"("scenario");

-- CreateIndex
CREATE INDEX "diagnose_reports_session_id_idx" ON "diagnose_reports"("session_id");

-- CreateIndex
CREATE INDEX "corpus_documents_category_idx" ON "corpus_documents"("category");

-- CreateIndex
CREATE INDEX "corpus_documents_issue_type_idx" ON "corpus_documents"("issue_type");

-- CreateIndex
CREATE INDEX "corpus_documents_is_active_idx" ON "corpus_documents"("is_active");

-- AddForeignKey
ALTER TABLE "diagnose_sessions" ADD CONSTRAINT "diagnose_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnose_reports" ADD CONSTRAINT "diagnose_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnose_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corpus_documents" ADD CONSTRAINT "corpus_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "corpus_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
