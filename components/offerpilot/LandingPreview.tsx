import Link from "next/link";

export default function LandingPreview() {
  return (
    <section className="px-4 pb-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-lg border border-neutral-400 bg-white">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:36px_36px]" />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-neutral-100 to-transparent" />

          <div className="relative grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="border-b border-neutral-400 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
              <div className="text-xs font-bold tracking-widest uppercase text-neutral-600">
                示例结果预览
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-neutral-600">当前主问题</p>
                <h3 className="mt-2 max-w-[16ch] text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
                  岗位匹配表达不清
                </h3>
                <p className="mt-3 max-w-[48ch] text-sm leading-relaxed text-neutral-700 sm:text-base">
                  你的经历并不是完全不相关，而是没有被快速理解成与目标岗位直接相关。
                </p>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-neutral-400 bg-neutral-100 p-4">
                  <p className="text-sm font-medium text-neutral-600">
                    你最该先做的一步
                  </p>
                  <p className="mt-2 text-base font-semibold leading-relaxed text-neutral-900">
                    先重写最相关的一段经历
                  </p>
                </div>

                <div className="rounded-lg border border-neutral-400 bg-neutral-100 p-4">
                  <p className="text-sm font-medium text-neutral-600">
                    最明确的问题
                  </p>
                  <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-neutral-700">
                    <p>• 缺少结果证据</p>
                    <p>• 与岗位要求连接不够直接</p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <Link
                  href="/demo/result"
                  className="inline-flex items-center rounded-md border border-neutral-400 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  查看完整示例结果
                </Link>
              </div>
            </div>

            <div className="p-6 sm:p-8 lg:p-10">
              <div className="space-y-4">
                <div className="rounded-lg border border-neutral-400 bg-white p-4">
                  <p className="text-sm font-medium text-neutral-600">岗位要求片段</p>
                  <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-700">
                    <p>负责内容策划、活动执行与复盘整理</p>
                    <p>能够配合团队推进项目落地</p>
                    <p>具备基础数据意识和优化判断</p>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-400 bg-white p-4">
                  <p className="text-sm font-medium text-neutral-600">简历片段</p>
                  <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-700">
                    <p>负责校园活动策划与执行，跟进现场落地</p>
                    <p>配合团队完成活动相关工作</p>
                    <p>活动结束后整理反馈信息，协助完成复盘材料</p>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-400 bg-neutral-100 p-4">
                  <p className="text-sm font-medium text-neutral-900">系统识别</p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                    经历里有相关动作，但结果和影响没有被清楚表达，所以招聘方不容易快速判断你的岗位匹配度。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
