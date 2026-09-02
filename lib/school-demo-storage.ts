export type SchoolTaskSubmissionStatus = 'submitted';

export interface SchoolTaskSubmission {
  id: string;
  taskId: string;
  studentName: string;
  studentCode: string;
  className: string;
  targetRole: string;
  resumeText: string;
  jobDescription: string;
  status: SchoolTaskSubmissionStatus;
  score: number;
  issue: string;
  revisionCount: number;
  submittedAt: string;
}

export const SCHOOL_TASK_SUBMISSIONS_KEY = 'offerpilot.schoolDashboard.studentSubmissions.v1';
export const DEFAULT_SCHOOL_TASK_ID = 'TASK-2026-SPRING-01';

function isSubmission(value: unknown): value is SchoolTaskSubmission {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SchoolTaskSubmission>;

  return Boolean(
    item.id &&
    item.taskId &&
    item.studentName &&
    item.studentCode &&
    item.className &&
    item.targetRole &&
    item.resumeText &&
    item.status === 'submitted' &&
    typeof item.score === 'number' &&
    typeof item.issue === 'string' &&
    typeof item.revisionCount === 'number' &&
    item.submittedAt
  );
}

export function readSchoolTaskSubmissions(): SchoolTaskSubmission[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SCHOOL_TASK_SUBMISSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSubmission);
  } catch {
    return [];
  }
}

export function writeSchoolTaskSubmissions(submissions: SchoolTaskSubmission[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SCHOOL_TASK_SUBMISSIONS_KEY, JSON.stringify(submissions));
}

export function upsertSchoolTaskSubmission(submission: SchoolTaskSubmission) {
  const current = readSchoolTaskSubmissions();
  const withoutCurrent = current.filter((item) => item.id !== submission.id);
  writeSchoolTaskSubmissions([submission, ...withoutCurrent].slice(0, 30));
}
