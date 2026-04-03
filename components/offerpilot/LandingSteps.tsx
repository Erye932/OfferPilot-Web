const steps = [
  {
    id: "01",
    title: "上传简历",
    description: "上传 PDF，或直接粘贴最相关的一段经历。",
  },
  {
    id: "02",
    title: "锁定岗位",
    description: "补充目标岗位和岗位要求，建立判断基准。",
  },
  {
    id: "03",
    title: "拿到建议",
    description: "看到主问题、优先动作和下一步修改方向。",
  },
];

export default function LandingSteps() {
  return (
    <section className="pt-4 pb-16 sm:pt-8 sm:pb-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <p className="text-sm font-medium text-neutral-500">How it works</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            三步完成一次诊断
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className="rounded-lg border border-neutral-300 bg-white p-6 transition hover:border-neutral-400 hover:bg-neutral-50"
            >
              <div className="text-xl font-black text-neutral-300 tracking-tighter">
                {step.id}
              </div>

              <h3 className="mt-6 text-xl font-semibold tracking-tight text-neutral-900">
                {step.title}
              </h3>

              <p className="mt-3 max-w-[26ch] text-sm leading-relaxed text-neutral-600">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
