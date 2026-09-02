import { performance } from 'node:perf_hooks';

interface CliOptions {
  baseUrl: string;
  mode: 'smoke' | 'load';
  concurrency: number;
  durationSeconds: number;
  timeoutMs: number;
  includeDiagnose: boolean;
}

interface Scenario {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  expectedStatuses: number[];
  weight: number;
  createRequestInit?: () => RequestInit;
}

interface Sample {
  scenario: string;
  status: number | null;
  durationMs: number;
  ok: boolean;
  error: string | null;
}

interface ScenarioSummary {
  scenario: string;
  total: number;
  ok: number;
  failed: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

const baseScenarios: Scenario[] = [
  { name: 'home_page', method: 'GET', path: '/', expectedStatuses: [200], weight: 3 },
  { name: 'contest_demo_page', method: 'GET', path: '/contest/demo', expectedStatuses: [200], weight: 2 },
  { name: 'diagnose_page', method: 'GET', path: '/diagnose', expectedStatuses: [200], weight: 2 },
  { name: 'demo_result_page', method: 'GET', path: '/demo/result', expectedStatuses: [200], weight: 1 },
  { name: 'school_dashboard_page', method: 'GET', path: '/school/dashboard', expectedStatuses: [200], weight: 3 },
  { name: 'student_submit_page', method: 'GET', path: '/school/task/submit', expectedStatuses: [200], weight: 2 },
  { name: 'ping_api', method: 'GET', path: '/api/ping', expectedStatuses: [200], weight: 4 },
  { name: 'readiness_api', method: 'GET', path: '/api/internal/readiness', expectedStatuses: [200, 503], weight: 1 },
  { name: 'school_dashboard_api', method: 'GET', path: '/api/school/dashboard', expectedStatuses: [200], weight: 3 },
  {
    name: 'pdf_upload_validation_api',
    method: 'POST',
    path: '/api/pdf/parse',
    expectedStatuses: [400],
    weight: 1,
    createRequestInit: () => {
      const formData = new FormData();
      formData.append('file', new Blob(['this is not a pdf'], { type: 'text/plain' }), 'resume.txt');
      return { body: formData };
    },
  },
];

const demoSafeDiagnoseScenario: Scenario = {
  name: 'demo_safe_diagnose_api',
  method: 'POST',
  path: '/api/diagnose',
  expectedStatuses: [200],
  weight: 1,
  createRequestInit: () => ({
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resume_text: '参与校园招聘系统项目，负责数据看板、学生提交入口和简历诊断流程设计。',
      resume_paragraphs: ['参与校园招聘系统项目，负责数据看板、学生提交入口和简历诊断流程设计。'],
      target_role: 'AI 产品经理',
      jd_text: '负责 AI 产品方案、数据分析和业务闭环设计。',
      tier: 'free',
      source_type: 'paste',
    }),
  }),
};

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000',
    mode: 'load',
    concurrency: parsePositiveInteger(process.env.LOAD_TEST_CONCURRENCY, 12),
    durationSeconds: parsePositiveInteger(process.env.LOAD_TEST_DURATION_SECONDS, 20),
    timeoutMs: parsePositiveInteger(process.env.LOAD_TEST_TIMEOUT_MS, 8000),
    includeDiagnose: process.env.LOAD_TEST_INCLUDE_DIAGNOSE === 'true',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--base-url' && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg === '--mode' && (next === 'smoke' || next === 'load')) {
      options.mode = next;
      index += 1;
    } else if (arg === '--concurrency' && next) {
      options.concurrency = parsePositiveInteger(next, options.concurrency);
      index += 1;
    } else if (arg === '--duration' && next) {
      options.durationSeconds = parsePositiveInteger(next, options.durationSeconds);
      index += 1;
    } else if (arg === '--timeout' && next) {
      options.timeoutMs = parsePositiveInteger(next, options.timeoutMs);
      index += 1;
    } else if (arg === '--include-diagnose') {
      options.includeDiagnose = true;
    } else if (arg === '--no-diagnose') {
      options.includeDiagnose = false;
    }
  }

  return options;
}

function getSelectedScenarios(options: CliOptions) {
  return options.includeDiagnose ? [...baseScenarios, demoSafeDiagnoseScenario] : baseScenarios;
}

function getWeightedScenarios(scenarios: Scenario[]) {
  return scenarios.flatMap((scenario) => Array.from({ length: scenario.weight }, () => scenario));
}

function getPercentile(sortedValues: number[], percentile: number) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(Math.ceil((percentile / 100) * sortedValues.length) - 1, sortedValues.length - 1);
  return sortedValues[Math.max(index, 0)];
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

async function requestScenario(scenario: Scenario, options: CliOptions): Promise<Sample> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const startedAt = performance.now();

  try {
    const init = scenario.createRequestInit?.() ?? {};
    const response = await fetch(new URL(scenario.path, options.baseUrl), {
      ...init,
      method: scenario.method,
      signal: controller.signal,
    });
    await response.arrayBuffer();

    const durationMs = performance.now() - startedAt;
    const ok = scenario.expectedStatuses.includes(response.status);
    return {
      scenario: scenario.name,
      status: response.status,
      durationMs,
      ok,
      error: ok ? null : `unexpected_status_${response.status}`,
    };
  } catch (error) {
    return {
      scenario: scenario.name,
      status: null,
      durationMs: performance.now() - startedAt,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSmoke(options: CliOptions, scenarios: Scenario[]) {
  const samples: Sample[] = [];
  for (const scenario of scenarios) {
    samples.push(await requestScenario(scenario, options));
  }
  return samples;
}

async function runLoad(options: CliOptions, scenarios: Scenario[]) {
  const weightedScenarios = getWeightedScenarios(scenarios);
  const samples: Sample[] = [];
  const endAt = Date.now() + options.durationSeconds * 1000;
  let cursor = 0;

  async function worker() {
    while (Date.now() < endAt) {
      const scenario = weightedScenarios[cursor % weightedScenarios.length];
      cursor += 1;
      samples.push(await requestScenario(scenario, options));
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  return samples;
}

async function assertDemoSafeMode(options: CliOptions) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(new URL('/api/internal/readiness', options.baseUrl), {
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.mode !== 'demo_safe') {
      throw new Error(`DEMO_SAFE_MODE is required before including /api/diagnose. readiness_status=${response.status} readiness_mode=${data.mode ?? 'unknown'}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(samples: Sample[]): ScenarioSummary[] {
  const grouped = new Map<string, Sample[]>();
  for (const sample of samples) {
    grouped.set(sample.scenario, [...(grouped.get(sample.scenario) ?? []), sample]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([scenario, scenarioSamples]) => {
      const durations = scenarioSamples.map((sample) => sample.durationMs).sort((left, right) => left - right);
      const ok = scenarioSamples.filter((sample) => sample.ok).length;
      const total = scenarioSamples.length;
      const avgMs = durations.reduce((sum, value) => sum + value, 0) / Math.max(total, 1);

      return {
        scenario,
        total,
        ok,
        failed: total - ok,
        avgMs: round(avgMs),
        p50Ms: round(getPercentile(durations, 50)),
        p95Ms: round(getPercentile(durations, 95)),
        p99Ms: round(getPercentile(durations, 99)),
        maxMs: round(durations[durations.length - 1] ?? 0),
      };
    });
}

function printReport(options: CliOptions, samples: Sample[]) {
  const total = samples.length;
  const failed = samples.filter((sample) => !sample.ok).length;
  const summary = summarize(samples);

  console.log('OfferPilot local pressure test');
  console.log(`baseUrl=${options.baseUrl}`);
  console.log(`mode=${options.mode} concurrency=${options.concurrency} duration=${options.durationSeconds}s timeout=${options.timeoutMs}ms includeDiagnose=${options.includeDiagnose}`);
  console.log(`total=${total} ok=${total - failed} failed=${failed}`);
  console.table(summary);

  const errors = samples.filter((sample) => !sample.ok).slice(0, 10);
  if (errors.length > 0) {
    console.log('first_failures=');
    console.table(errors.map((sample) => ({
      scenario: sample.scenario,
      status: sample.status,
      durationMs: round(sample.durationMs),
      error: sample.error,
    })));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.includeDiagnose) {
    await assertDemoSafeMode(options);
  }

  const scenarios = getSelectedScenarios(options);
  const samples = options.mode === 'smoke' ? await runSmoke(options, scenarios) : await runLoad(options, scenarios);
  printReport(options, samples);

  if (samples.some((sample) => !sample.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
