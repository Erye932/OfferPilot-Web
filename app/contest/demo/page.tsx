import Link from 'next/link';
import AppTopNav from '@/components/offerpilot/AppTopNav';

const demoSteps = [
  {
    id: '01',
    title: '先讲产品定位',
    duration: '30 秒',
    path: '/',
    action: '打开首页，指出 OfferPilot 不是单点简历工具，而是高校就业材料质量管理平台。',
    talkingPoint: '智联视角下，核心价值是把学生材料质量、岗位匹配和投递结果沉淀为可复用数据。',
  },
  {
    id: '02',
    title: '模拟学生提交',
    duration: '60 秒',
    path: '/school/task/submit',
    action: '点击“填入演示学生”，再点击“提交给老师”。',
    talkingPoint: '学生只需要提交简历、目标岗位和可选 JD，系统就能进入学校任务闭环。',
  },
  {
    id: '03',
    title: '展示老师工作台',
    duration: '90 秒',
    path: '/school/dashboard',
    action: '查看任务指标、流程进度和老师审核队列，找到刚提交的学生。',
    talkingPoint: '老师看到的不只是个人报告，而是班级提交率、修改率、通过率和共性问题。',
  },
  {
    id: '04',
    title: '完成审核动作',
    duration: '45 秒',
    path: '/school/dashboard',
    action: '在审核队列里把学生标记为“需修改 / 重点辅导 / 通过”，观察指标实时变化。',
    talkingPoint: '这一步证明 OfferPilot 能支持老师管理真实教学/就业任务，而不是只生成一次性建议。',
  },
  {
    id: '05',
    title: '导出质量报告',
    duration: '45 秒',
    path: '/school/dashboard',
    action: '点击“导出质量报告”，说明学校可以获得可汇报、可复盘的就业材料质量结果。',
    talkingPoint: '对学校是管理抓手，对智联是高质量人岗匹配与投递转化数据入口。',
  },
];

const judgeQuestions = [
  {
    question: '为什么不是普通 C 端简历工具？',
    answer: '因为闭环的购买者和管理者是学校，老师有任务、队列、审核和报告，学生是被服务对象。',
  },
  {
    question: '智联生态价值在哪里？',
    answer: '平台可沉淀岗位方向、简历短板、修改行为和投递结果，用于提升人岗匹配、校园招聘质量和企业筛选效率。',
  },
  {
    question: '数据从哪里来？',
    answer: '先从学校任务制场景获得学生授权提交、诊断报告、老师审核和投递结果反馈，形成合规的一方数据闭环。',
  },
];

export default function ContestDemoPage() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <AppTopNav current="diagnose" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="grid gap-6 border-b border-neutral-200 pb-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">
              智联比赛演示路线 · 5 分钟闭环讲解
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
              按这条路线演示 OfferPilot
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-500">
              这页用于比赛现场控节奏：从产品定位开始，依次展示学生提交、老师看板、审核动作和质量报告导出，突出 B2B2C 商业闭环。
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-neutral-950">一句话开场</p>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              OfferPilot 帮学校把学生就业材料从“个人凭感觉修改”变成“任务化提交、AI 诊断、老师审核、质量报告和投递结果追踪”的数据闭环。
            </p>
          </div>
        </header>

        <section className="mt-8 grid gap-5 lg:grid-cols-5">
          {demoSteps.map((step) => (
            <article key={step.id} className="flex flex-col rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-2xl font-black tracking-tighter text-neutral-300">{step.id}</span>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-500">{step.duration}</span>
              </div>
              <h2 className="mt-5 text-lg font-semibold tracking-tight text-neutral-950">{step.title}</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-600">{step.action}</p>
              <p className="mt-4 rounded-2xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-500">{step.talkingPoint}</p>
              <Link
                href={step.path}
                className="mt-auto pt-5 text-sm font-medium text-neutral-950 underline underline-offset-4"
              >
                打开页面
              </Link>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-3xl border border-neutral-200 bg-neutral-950 p-6 text-white shadow-sm">
            <h2 className="text-xl font-semibold tracking-tight">比赛讲解主线</h2>
            <div className="mt-5 space-y-4 text-sm leading-7 text-neutral-300">
              <p>1. 先讲就业材料质量是高校就业工作的真实痛点。</p>
              <p>2. 再讲 OfferPilot 用 AI 诊断降低学生修改门槛。</p>
              <p>3. 然后讲老师工作台把个人诊断变成班级管理。</p>
              <p>4. 最后讲投递结果反馈让智联获得更强的人岗匹配数据闭环。</p>
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold tracking-tight text-neutral-950">评委可能追问</h2>
            <div className="mt-5 divide-y divide-neutral-100">
              {judgeQuestions.map((item) => (
                <div key={item.question} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-medium text-neutral-950">{item.question}</p>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-neutral-950">现场推荐操作顺序</h2>
              <p className="mt-2 text-sm text-neutral-500">先学生端提交，再老师端审核，最后导出报告。</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/school/task/submit" className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:border-neutral-500">
                从学生提交开始
              </Link>
              <Link href="/school/dashboard" className="inline-flex items-center justify-center rounded-xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-700">
                直接打开老师工作台
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
