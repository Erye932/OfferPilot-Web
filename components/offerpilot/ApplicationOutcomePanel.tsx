'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  APPLICATION_OUTCOME_STAGE_LABELS,
  APPLICATION_OUTCOME_STAGE_ORDER,
  type ApplicationOutcomeStageValue,
} from '@/lib/application-outcomes';

interface ApplicationOutcomePanelProps {
  reportId?: string;
  targetRole?: string;
}

interface OutcomeItem {
  id: string;
  companyName?: string | null;
  jobTitle: string;
  platform?: string | null;
  outcomeStage: ApplicationOutcomeStageValue;
  createdAt: string;
}

const DEFAULT_STAGE: ApplicationOutcomeStageValue = 'applied';
const LOCAL_STORAGE_PREFIX = 'offerpilot_application_outcomes';

function getLocalStorageKey(reportId?: string, targetRole?: string) {
  return `${LOCAL_STORAGE_PREFIX}:${reportId || targetRole || 'anonymous'}`;
}

function readLocalOutcomes(key: string): OutcomeItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeLocalOutcomes(key: string, outcomes: OutcomeItem[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, JSON.stringify(outcomes.slice(0, 5)));
  } catch {
    return;
  }
}

function mergeOutcomes(primary: OutcomeItem[], secondary: OutcomeItem[]) {
  const byId = new Map<string, OutcomeItem>();
  for (const outcome of [...primary, ...secondary]) {
    byId.set(outcome.id, outcome);
  }
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
}

export default function ApplicationOutcomePanel({ reportId, targetRole }: ApplicationOutcomePanelProps) {
  const [jobTitle, setJobTitle] = useState(targetRole || '');
  const [companyName, setCompanyName] = useState('');
  const [platform, setPlatform] = useState('');
  const [outcomeStage, setOutcomeStage] = useState<ApplicationOutcomeStageValue>(DEFAULT_STAGE);
  const [rejectionReason, setRejectionReason] = useState('');
  const [userNote, setUserNote] = useState('');
  const [outcomes, setOutcomes] = useState<OutcomeItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const storageKey = useMemo(() => getLocalStorageKey(reportId, targetRole), [reportId, targetRole]);

  const latestOutcomeLabel = useMemo(() => {
    const latest = outcomes[0];
    if (!latest) return '';
    return `${latest.jobTitle} · ${APPLICATION_OUTCOME_STAGE_LABELS[latest.outcomeStage]}`;
  }, [outcomes]);

  useEffect(() => {
    const localOutcomes = readLocalOutcomes(storageKey);
    if (localOutcomes.length > 0) setOutcomes(localOutcomes);
    if (!reportId) return;

    let aborted = false;
    fetch(`/api/applications/outcomes?reportId=${encodeURIComponent(reportId)}&limit=5`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (aborted || !data?.outcomes) return;
        setOutcomes(mergeOutcomes(data.outcomes, readLocalOutcomes(storageKey)));
      })
      .catch(() => undefined);

    return () => {
      aborted = true;
    };
  }, [reportId, storageKey]);

  function resetForm() {
    setCompanyName('');
    setPlatform('');
    setRejectionReason('');
    setUserNote('');
  }

  function saveLocalFallback() {
    const localOutcome: OutcomeItem = {
      id: `local-${Date.now()}`,
      companyName: companyName.trim() || null,
      jobTitle: jobTitle.trim(),
      platform: platform.trim() || null,
      outcomeStage,
      createdAt: new Date().toISOString(),
    };

    setOutcomes((current) => {
      const next = mergeOutcomes([localOutcome], current);
      writeLocalOutcomes(storageKey, next);
      return next;
    });
    resetForm();
    setMessage('数据库暂不可用，已先保存在本机演示数据中');
    setIsOpen(false);
  }

  async function submitOutcome() {
    if (!jobTitle.trim()) {
      setMessage('请填写岗位名称');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      const response = await fetch('/api/applications/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          targetRole,
          jobTitle: jobTitle.trim(),
          companyName: companyName.trim() || null,
          platform: platform.trim() || null,
          outcomeStage,
          rejectionReason: rejectionReason.trim() || null,
          userNote: userNote.trim() || null,
          resumeVersionLabel: '诊断后版本',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        saveLocalFallback();
        return;
      }

      if (data?.outcome) {
        setOutcomes((current) => [data.outcome, ...current].slice(0, 5));
      }
      resetForm();
      setMessage('已记录，这会成为后续复盘和学校看板的数据');
      setIsOpen(false);
    } catch {
      saveLocalFallback();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-neutral-900">投递结果回流</h3>
          <p className="mt-1 text-sm leading-6 text-neutral-500">
            记录真实投递结果，后续才能判断哪些建议真的有效。
          </p>
          {latestOutcomeLabel && (
            <p className="mt-2 text-xs text-neutral-400">最近记录：{latestOutcomeLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          {isOpen ? '收起' : '记录投递结果'}
        </button>
      </div>

      {isOpen && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-neutral-500">岗位名称</span>
            <input
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-900"
              placeholder="Java 后端实习"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-neutral-500">公司</span>
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-900"
              placeholder="可选"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-neutral-500">平台</span>
            <input
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-900"
              placeholder="智联 / BOSS / 牛客 / 官网"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-neutral-500">当前结果</span>
            <select
              value={outcomeStage}
              onChange={(event) => setOutcomeStage(event.target.value as ApplicationOutcomeStageValue)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-neutral-900"
            >
              {APPLICATION_OUTCOME_STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>{APPLICATION_OUTCOME_STAGE_LABELS[stage]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-neutral-500">失败原因 / 进展说明</span>
            <input
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-900"
              placeholder="例如：无回复、学历不匹配、项目被追问、已进入一面"
            />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-medium text-neutral-500">补充备注</span>
            <textarea
              value={userNote}
              onChange={(event) => setUserNote(event.target.value)}
              className="min-h-24 w-full resize-y rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none transition focus:border-neutral-900"
              placeholder="可以记录投递时间、面试问题、HR 反馈等"
            />
          </label>
          <div className="flex items-center gap-3 md:col-span-2">
            <button
              type="button"
              onClick={submitOutcome}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? '保存中...' : '保存结果'}
            </button>
            {message && <p className="text-sm text-neutral-500">{message}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
