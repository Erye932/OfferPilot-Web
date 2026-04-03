-- CreateEnum
CREATE TYPE "LeadSourceChannel" AS ENUM ('xiaohongshu', 'xianyu', 'referral', 'direct', 'wechat', 'douyin', 'bilibili', 'zhihu', 'other');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'paid', 'delivered', 'closed', 'lost');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('free_check', 'basic_fix', 'deep_fix', 'custom', 'consultation');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('intake', 'diagnosing', 'revising', 'delivered', 'followup', 'closed');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('fresh_grad', 'internship_poor', 'early_career', 'mid_career', 'senior', 'unknown');

-- CreateEnum
CREATE TYPE "AtsRiskLevel" AS ENUM ('low', 'medium', 'high', 'unknown');

-- CreateEnum
CREATE TYPE "HrRiskLevel" AS ENUM ('low', 'medium', 'high', 'unknown');

-- CreateEnum
CREATE TYPE "DirectionMismatchLevel" AS ENUM ('none', 'weak', 'medium', 'strong', 'unknown');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('raw_resume', 'cleaned_resume', 'final_resume', 'jd', 'final_delivery', 'other');

-- CreateEnum
CREATE TYPE "FeedbackStage" AS ENUM ('after_delivery', 'day7', 'day30');

-- CreateEnum
CREATE TYPE "PatternType" AS ENUM ('diagnosis', 'rewrite', 'interview_risk', 'jd_match', 'career_path', 'skill_gap');

-- CreateEnum
CREATE TYPE "PatternStatus" AS ENUM ('draft', 'validated', 'deprecated');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "source_channel" "LeadSourceChannel" NOT NULL,
    "platform_handle" TEXT,
    "nickname" TEXT,
    "contact_note" TEXT,
    "first_contact_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_cases" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT,
    "diagnose_session_id" TEXT,
    "diagnose_report_id" TEXT,
    "service_type" "ServiceType" NOT NULL,
    "case_status" "CaseStatus" NOT NULL DEFAULT 'intake',
    "target_role" TEXT,
    "role_family" TEXT,
    "candidate_stage" "CandidateStage" NOT NULL DEFAULT 'unknown',
    "jd_provided" BOOLEAN NOT NULL DEFAULT false,
    "consent_save_raw" BOOLEAN NOT NULL DEFAULT false,
    "consent_use_anonymized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_snapshots" (
    "id" TEXT NOT NULL,
    "service_case_id" TEXT NOT NULL,
    "snapshot_type" "SnapshotType" NOT NULL,
    "content" TEXT NOT NULL,
    "is_anonymized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnosis_labels" (
    "id" TEXT NOT NULL,
    "service_case_id" TEXT NOT NULL,
    "main_judgment" TEXT NOT NULL,
    "secondary_issues" JSONB,
    "issue_dimensions" JSONB,
    "ats_risk_level" "AtsRiskLevel" NOT NULL DEFAULT 'unknown',
    "hr_risk_level" "HrRiskLevel" NOT NULL DEFAULT 'unknown',
    "direction_mismatch_level" "DirectionMismatchLevel" NOT NULL DEFAULT 'unknown',
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'medium',
    "requires_user_input" BOOLEAN NOT NULL DEFAULT false,
    "human_reviewed" BOOLEAN NOT NULL DEFAULT true,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnosis_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewrite_pairs" (
    "id" TEXT NOT NULL,
    "service_case_id" TEXT NOT NULL,
    "issue_type" TEXT,
    "rewrite_type" TEXT,
    "source_location" JSONB,
    "originalText" TEXT NOT NULL,
    "rewrittenText" TEXT NOT NULL,
    "change_summary" TEXT,
    "needs_user_input" BOOLEAN NOT NULL DEFAULT false,
    "adopted_by_user" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rewrite_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_events" (
    "id" TEXT NOT NULL,
    "service_case_id" TEXT NOT NULL,
    "stage" "FeedbackStage" NOT NULL,
    "adopted_actions" JSONB,
    "rejected_actions" JSONB,
    "applied_after_revision" BOOLEAN,
    "interview_count" INTEGER,
    "offer_count" INTEGER,
    "satisfaction_score" INTEGER,
    "feedback_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_patterns" (
    "id" TEXT NOT NULL,
    "role_family" TEXT,
    "issue_type" TEXT,
    "pattern_type" "PatternType" NOT NULL,
    "title" TEXT NOT NULL,
    "pattern_text" TEXT NOT NULL,
    "strength_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "evidence_count" INTEGER NOT NULL DEFAULT 0,
    "status" "PatternStatus" NOT NULL DEFAULT 'draft',
    "last_validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_evidences" (
    "id" TEXT NOT NULL,
    "knowledge_pattern_id" TEXT NOT NULL,
    "service_case_id" TEXT,
    "rewrite_pair_id" TEXT,
    "diagnosis_label_id" TEXT,
    "evidence_snippet" TEXT NOT NULL,
    "outcome_tag" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_source_channel_idx" ON "leads"("source_channel");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_first_contact_at_idx" ON "leads"("first_contact_at");

-- CreateIndex
CREATE INDEX "service_cases_lead_id_idx" ON "service_cases"("lead_id");

-- CreateIndex
CREATE INDEX "service_cases_diagnose_session_id_idx" ON "service_cases"("diagnose_session_id");

-- CreateIndex
CREATE INDEX "service_cases_diagnose_report_id_idx" ON "service_cases"("diagnose_report_id");

-- CreateIndex
CREATE INDEX "service_cases_service_type_idx" ON "service_cases"("service_type");

-- CreateIndex
CREATE INDEX "service_cases_case_status_idx" ON "service_cases"("case_status");

-- CreateIndex
CREATE INDEX "service_cases_target_role_idx" ON "service_cases"("target_role");

-- CreateIndex
CREATE INDEX "service_cases_role_family_idx" ON "service_cases"("role_family");

-- CreateIndex
CREATE INDEX "service_cases_candidate_stage_idx" ON "service_cases"("candidate_stage");

-- CreateIndex
CREATE INDEX "case_snapshots_service_case_id_idx" ON "case_snapshots"("service_case_id");

-- CreateIndex
CREATE INDEX "case_snapshots_snapshot_type_idx" ON "case_snapshots"("snapshot_type");

-- CreateIndex
CREATE INDEX "diagnosis_labels_service_case_id_idx" ON "diagnosis_labels"("service_case_id");

-- CreateIndex
CREATE INDEX "diagnosis_labels_ats_risk_level_idx" ON "diagnosis_labels"("ats_risk_level");

-- CreateIndex
CREATE INDEX "diagnosis_labels_hr_risk_level_idx" ON "diagnosis_labels"("hr_risk_level");

-- CreateIndex
CREATE INDEX "diagnosis_labels_direction_mismatch_level_idx" ON "diagnosis_labels"("direction_mismatch_level");

-- CreateIndex
CREATE INDEX "rewrite_pairs_service_case_id_idx" ON "rewrite_pairs"("service_case_id");

-- CreateIndex
CREATE INDEX "rewrite_pairs_issue_type_idx" ON "rewrite_pairs"("issue_type");

-- CreateIndex
CREATE INDEX "rewrite_pairs_rewrite_type_idx" ON "rewrite_pairs"("rewrite_type");

-- CreateIndex
CREATE INDEX "feedback_events_service_case_id_idx" ON "feedback_events"("service_case_id");

-- CreateIndex
CREATE INDEX "feedback_events_stage_idx" ON "feedback_events"("stage");

-- CreateIndex
CREATE INDEX "knowledge_patterns_role_family_idx" ON "knowledge_patterns"("role_family");

-- CreateIndex
CREATE INDEX "knowledge_patterns_issue_type_idx" ON "knowledge_patterns"("issue_type");

-- CreateIndex
CREATE INDEX "knowledge_patterns_pattern_type_idx" ON "knowledge_patterns"("pattern_type");

-- CreateIndex
CREATE INDEX "knowledge_patterns_status_idx" ON "knowledge_patterns"("status");

-- CreateIndex
CREATE INDEX "knowledge_patterns_strength_score_idx" ON "knowledge_patterns"("strength_score");

-- CreateIndex
CREATE INDEX "pattern_evidences_knowledge_pattern_id_idx" ON "pattern_evidences"("knowledge_pattern_id");

-- CreateIndex
CREATE INDEX "pattern_evidences_service_case_id_idx" ON "pattern_evidences"("service_case_id");

-- CreateIndex
CREATE INDEX "pattern_evidences_rewrite_pair_id_idx" ON "pattern_evidences"("rewrite_pair_id");

-- CreateIndex
CREATE INDEX "pattern_evidences_diagnosis_label_id_idx" ON "pattern_evidences"("diagnosis_label_id");

-- AddForeignKey
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_diagnose_session_id_fkey" FOREIGN KEY ("diagnose_session_id") REFERENCES "diagnose_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_cases" ADD CONSTRAINT "service_cases_diagnose_report_id_fkey" FOREIGN KEY ("diagnose_report_id") REFERENCES "diagnose_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_snapshots" ADD CONSTRAINT "case_snapshots_service_case_id_fkey" FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnosis_labels" ADD CONSTRAINT "diagnosis_labels_service_case_id_fkey" FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewrite_pairs" ADD CONSTRAINT "rewrite_pairs_service_case_id_fkey" FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_service_case_id_fkey" FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_evidences" ADD CONSTRAINT "pattern_evidences_knowledge_pattern_id_fkey" FOREIGN KEY ("knowledge_pattern_id") REFERENCES "knowledge_patterns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_evidences" ADD CONSTRAINT "pattern_evidences_service_case_id_fkey" FOREIGN KEY ("service_case_id") REFERENCES "service_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_evidences" ADD CONSTRAINT "pattern_evidences_rewrite_pair_id_fkey" FOREIGN KEY ("rewrite_pair_id") REFERENCES "rewrite_pairs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_evidences" ADD CONSTRAINT "pattern_evidences_diagnosis_label_id_fkey" FOREIGN KEY ("diagnosis_label_id") REFERENCES "diagnosis_labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
