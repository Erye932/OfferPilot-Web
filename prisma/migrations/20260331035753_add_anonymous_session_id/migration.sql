-- AlterTable
ALTER TABLE "diagnose_sessions" ADD COLUMN     "uploaded_file_id" TEXT;

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN     "anonymous_session_id" TEXT;

-- CreateIndex
CREATE INDEX "usage_records_anonymous_session_id_action_type_created_at_idx" ON "usage_records"("anonymous_session_id", "action_type", "created_at");

-- AddForeignKey
ALTER TABLE "diagnose_sessions" ADD CONSTRAINT "diagnose_sessions_uploaded_file_id_fkey" FOREIGN KEY ("uploaded_file_id") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
