import Link from "next/link";
import AppTopNav from "@/components/offerpilot/AppTopNav";

export default function InterviewPage() {
  return (
    <main className="min-h-screen bg-[#F7F8FA] text-slate-900">
      <AppTopNav current="interview" />

      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <section className="flex flex-1 items-center py-16 sm:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500">
              Interview Follow-up
            </div>

            <h1 className="mt-8 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              面试追问模块
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
              这一模块会围绕你的目标岗位和简历内容，提前生成更可能被问到的追问方向。
              当前先提供可访问的占位页，后续再补完整交互与题目逻辑。
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
