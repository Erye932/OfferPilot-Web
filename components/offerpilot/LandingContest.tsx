import Link from "next/link";

const workflowSteps = [
  "学校创建任务",
  "学生提交简历",
  "AI 诊断报告",
  "老师审核修改",
  "导出质量报告",
];

const valueCards = [
  {
    title: "对学校",
    metric: "就业材料质量可视化",
    description: "从单个学生诊断升级为班级、学院维度的质量管理，帮助就业中心识别共性短板。",
  },
  {
    title: "对学生",
    metric: "少走弯路",
    description: "先判断问题是表达、匹配还是方向，再按优先级修改简历和投递策略。",
  },
  {
    title: "对招聘生态",
    metric: "更高质量的人岗匹配数据",
    description: "沉淀岗位方向、材料短板、投递结果与改写反馈，为招聘平台形成可复用的数据闭环。",
  },
];

export default function LandingContest() {
  return (
    <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-neutral-300 bg-neutral-950 text-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-white/10 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
            <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-neutral-200">
              智联比赛展示版本 · B2B2C 高校就业闭环
            </div>

            <h2 className="mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              从 AI 简历诊断，升级为高校就业材料质量管理平台
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-300 sm:text-base">
              OfferPilot 面向学校、老师和学生构建任务制闭环：学校统一发起就业材料诊断任务，学生提交简历和岗位方向，AI 生成个人报告，老师审核重点学生，最终导出班级质量报告。
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/contest/demo"
                className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200"
              >
                查看比赛演示路线
              </Link>
              <Link
                href="/school/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 px-5 py-3 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
              >
                打开学校工作台
              </Link>
            </div>
          </div>

          <div className="bg-white/[0.03] p-6 sm:p-8 lg:p-10">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">Closed Loop</p>
              <div className="mt-5 space-y-3">
                {workflowSteps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-neutral-950">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-neutral-100">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {valueCards.map((card) => (
                <div key={card.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-neutral-400">{card.title}</p>
                  <h3 className="mt-1 text-base font-semibold text-white">{card.metric}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-300">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
