import Link from "next/link";
import AppTopNav from "@/components/offerpilot/AppTopNav";

export default function RecommendationsPage() {
  return (
    <main className="min-h-screen bg-[#F7F8FA] text-slate-900">
      <AppTopNav current="recommendations" />

      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <section className="flex flex-1 items-center py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500">
              Recommendations
            </div>

            <h1 className="mt-8 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              岗位推荐模块
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
              这一模块会基于你的经历结构、目标方向和诊断结果，给出更适合继续投递的岗位建议。
              当前先提供可访问的占位页，后续再接入完整推荐逻辑。
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/diagnose"
                className="inline-flex items-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                先去做诊断
              </Link>

              <Link
                href="/"
                className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
              >
                返回首页
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
