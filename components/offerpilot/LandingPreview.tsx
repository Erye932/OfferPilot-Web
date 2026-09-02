import Link from "next/link";

export default function LandingPreview() {
  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8 bg-white border-b border-neutral-200">
      <div className="mx-auto max-w-6xl">
        {/* 单一纯净纸片容器：方方正正、0圆弧、极简线条分割 */}
        <div className="border border-neutral-300 bg-white">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            
            {/* 左侧：诊断发现与行动建议 */}
            <div className="p-6 sm:p-8 lg:p-10 border-b border-neutral-200 lg:border-b-0 lg:border-r">
              <div className="text-xs font-bold tracking-widest uppercase text-neutral-500 font-mono">
                示例结果预览
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-neutral-500">当前主问题</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                  岗位匹配表达不清
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600 sm:text-base">
                  你的经历并不是完全不相关，而是没有被快速理解成与目标岗位直接相关。
                </p>
              </div>

              {/* 极简细线分割替代原本的圆角嵌套灰框 */}
              <div className="mt-8 grid gap-6 sm:grid-cols-2 border-t border-neutral-200 pt-6">
                <div className="border-l-2 border-neutral-900 pl-3.5">
                  <p className="text-xs font-medium text-neutral-500">
                    你最该先做的一步
                  </p>
                  <p className="mt-1.5 text-sm font-bold text-neutral-950 leading-snug">
                    先重写最相关的一段经历
                  </p>
                </div>

                <div className="border-l-2 border-neutral-300 pl-3.5">
                  <p className="text-xs font-medium text-neutral-500">
                    最明确的问题
                  </p>
                  <div className="mt-1.5 space-y-1 text-xs text-neutral-700 leading-relaxed font-medium">
                    <p>• 缺少结果证据</p>
                    <p>• 与岗位要求连接不够直接</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-neutral-100">
                <Link
                  href="/demo/result"
                  className="inline-flex items-center text-xs font-semibold text-neutral-700 transition-colors hover:text-neutral-950 hover:underline underline-offset-4"
                >
                  查看完整示例结果 ↗
                </Link>
              </div>
            </div>

            {/* 右侧：上下文片段与系统识别（极简发丝线分割，无嵌套框） */}
            <div className="p-6 sm:p-8 lg:p-10 bg-neutral-50/50 flex flex-col justify-between space-y-6">
              <div className="space-y-6">
                {/* 岗位要求片段 */}
                <div className="border-b border-neutral-200 pb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 font-mono">
                    岗位要求片段
                  </p>
                  <div className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-neutral-700 font-mono">
                    <p>• 负责内容策划、活动执行与复盘整理</p>
                    <p>• 能够配合团队推进项目落地</p>
                    <p>• 具备基础数据意识和优化判断</p>
                  </div>
                </div>

                {/* 简历片段 */}
                <div className="border-b border-neutral-200 pb-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 font-mono">
                    简历片段
                  </p>
                  <div className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-neutral-700">
                    <p>• 负责校园活动策划与执行，跟进现场落地</p>
                    <p>• 配合团队完成活动相关工作</p>
                    <p>• 活动结束后整理反馈信息，协助完成复盘材料</p>
                  </div>
                </div>
              </div>

              {/* 系统识别 */}
              <div className="border-l-2 border-neutral-900 bg-white p-4 border border-neutral-200">
                <p className="text-xs font-bold text-neutral-950 font-mono">
                  系统识别
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-600">
                  经历里有相关动作，但结果和影响没有被清楚表达，所以招聘方不容易快速判断你的岗位匹配度。
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
