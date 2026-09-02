"use client";

const steps = [
  {
    num: "01",
    title: "上传简历",
    desc: "上传 PDF，或直接粘贴最相关的一段经历。",
  },
  {
    num: "02",
    title: "锁定岗位",
    desc: "补充目标岗位和岗位要求，建立判断基准。",
  },
  {
    num: "03",
    title: "拿到建议",
    desc: "看到主问题、优先动作和下一步修改方向。",
  },
];

export default function LandingSteps() {
  return (
    <section className="bg-white pb-24 sm:pb-32">
      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        
        {/* 纯净极简发丝细线（彻底去除多余中英文杂标） */}
        <div className="border-t border-neutral-200/80 mb-14" />

        {/* 纯粹 3 列排版 */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-12 lg:gap-16">
          {steps.map((item) => (
            <div key={item.num}>
              <span className="font-mono text-xs font-semibold text-neutral-400">
                {item.num}
              </span>
              <h3 className="mt-3 text-base font-bold tracking-tight text-neutral-950">
                {item.title}
              </h3>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-neutral-500">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
