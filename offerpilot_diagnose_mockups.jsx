export default function OfferPilotDiagnoseMockups() {
  const chip = "inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700";
  const card = "rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.05)]";
  const section = "mx-auto w-full max-w-[1200px]";

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900">
      <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-[#F7F8FA]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-blue-600" />
            <div className="text-sm font-semibold">OfferPilot Diagnose Mockups</div>
          </div>
          <div className="text-xs text-slate-500">首页 / 输入页 / 结果页</div>
        </div>
      </div>

      <main className="space-y-16 px-6 py-10">
        <section className={section}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">首页高保真草稿</h1>
              <p className="mt-1 text-sm text-slate-500">黑白为主，蓝色为辅，Hero 极简克制。</p>
            </div>
            <span className={chip}>Landing Page</span>
          </div>
          <div className={`${card} overflow-hidden`}>
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-8">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-600" />
                <div className="font-semibold">OfferPilot Diagnose</div>
              </div>
              <div className="flex items-center gap-6 text-sm text-slate-600">
                <span>诊断示例</span>
                <span>历史记录</span>
                <button className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white">开始诊断</button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-6 px-8 py-14">
              <div className="col-span-5 flex flex-col justify-center">
                <h2 className="max-w-[520px] text-6xl font-semibold leading-[1.05] tracking-tight">
                  先定位你的求职阻塞点
                </h2>
                <p className="mt-6 max-w-[560px] text-lg leading-8 text-slate-600">
                  OfferPilot 会结合你的岗位要求和经历内容，帮你判断问题更偏表达、匹配还是方向。
                </p>
                <div className="mt-8 flex items-center gap-3">
                  <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white">开始诊断</button>
                  <button className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800">查看示例结果</button>
                </div>
                <p className="mt-3 text-xs text-slate-400">无需注册，上传 PDF 简历即可免费开始</p>
              </div>

              <div className="col-span-1" />

              <div className="col-span-6">
                <div className="mx-auto max-w-[620px] rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(0,0,0,0.06)]">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">基础版结果预览</div>
                      <div className="mt-1 text-lg font-semibold">诊断结果</div>
                    </div>
                    <span className={chip}>基础版结果</span>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="text-sm font-medium text-slate-500">当前主问题</div>
                    <div className="mt-3 text-2xl font-semibold leading-9">岗位匹配表达不清</div>
                    <div className="mt-4 flex gap-2">
                      <span className={chip}>匹配问题</span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">表达问题</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-200 p-5">
                      <div className="text-sm font-medium text-slate-500">最该先做的一步</div>
                      <div className="mt-3 text-base font-semibold leading-7">先重写最相关的一段经历</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-5">
                      <div className="text-sm font-medium text-slate-500">最明确的两个问题</div>
                      <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        <li>• 缺少结果证据</li>
                        <li>• 与岗位要求连接不够直接</li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-500">增强版</div>
                        <div className="mt-1 text-sm text-slate-700">可直接复制的改写候选与优先修改顺序</div>
                      </div>
                      <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white">9.9 元解锁</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-[#F7F8FA] px-8 py-8">
              <div className="grid grid-cols-3 gap-5">
                {[
                  ["上传简历", "上传 PDF，或补充最相关经历"],
                  ["补充岗位要求", "填写目标岗位和岗位要求"],
                  ["获取诊断结果", "看到主问题、优先动作和修改建议"],
                ].map(([title, desc]) => (
                  <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="mb-4 h-10 w-10 rounded-xl bg-blue-50" />
                    <div className="text-lg font-semibold">{title}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={section}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">输入页高保真草稿</h2>
              <p className="mt-1 text-sm text-slate-500">中间定宽，渐进式展开，PDF 为主路径。</p>
            </div>
            <span className={chip}>Input Page</span>
          </div>
          <div className={`${card} px-8 py-10`}>
            <div className="mx-auto max-w-[720px]">
              <div className="mb-10 text-center">
                <div className="text-3xl font-semibold tracking-tight">开始诊断</div>
                <p className="mt-3 text-base text-slate-600">先上传简历，系统会逐步引导你补齐本次诊断需要的信息。</p>
              </div>

              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-10 text-center shadow-[0_8px_24px_rgba(0,0,0,0.03)]">
                <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-blue-50" />
                <div className="text-2xl font-semibold">上传 PDF 简历</div>
                <div className="mt-2 text-sm text-slate-500">推荐，最快开始诊断</div>
                <button className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white">选择文件</button>
                <div className="mt-4 text-xs text-slate-400">建议上传当前正在用于投递的简历</div>
              </div>

              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
                <div className="text-sm text-slate-500">resume_amanda.pdf</div>
                <div className="mt-1 text-base font-medium text-slate-800">已上传，正在准备解析</div>
                <button className="mt-3 text-sm font-medium text-blue-700">更换文件</button>
              </div>

              <div className="mt-8 space-y-6">
                <div>
                  <label className="mb-3 block text-base font-semibold text-slate-800">你想投什么岗位？</label>
                  <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-400">例如：内容运营 / 产品助理 / 用户运营</div>
                  <div className="mt-2 text-xs text-slate-500">写你当前最想投的那个岗位，不用一次写很多。</div>
                </div>
                <div>
                  <label className="mb-3 block text-base font-semibold text-slate-800">把你看到的岗位要求粘贴进来</label>
                  <div className="min-h-[148px] rounded-xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-400">例如：负责活动策划与执行，能做数据复盘，具备跨团队协作能力……</div>
                  <div className="mt-2 text-xs text-slate-500">只需要粘贴岗位职责和任职要求，不用整篇招聘信息。</div>
                </div>
                <div className="rounded-xl bg-blue-50 px-4 py-4 text-sm leading-6 text-slate-700">
                  <div className="font-medium text-slate-900">你的简历排版较复杂，系统暂时无法稳定识别全部内容</div>
                  <div className="mt-1">为了保证诊断准确，请直接补充 1–2 段最相关的经历内容。</div>
                  <button className="mt-3 text-sm font-medium text-blue-700">改为粘贴经历内容</button>
                </div>
                <div>
                  <label className="mb-3 block text-base font-semibold text-slate-800">补充你最想诊断的经历内容</label>
                  <div className="min-h-[132px] rounded-xl border border-slate-300 bg-white px-4 py-4 text-sm text-slate-400">例如：在腾讯实习时负责活动策划与复盘</div>
                  <div className="mt-2 text-xs text-slate-500">如果你的简历排版较复杂，补充这段内容会让诊断更准确。</div>
                </div>
              </div>

              <div className="mt-8 space-y-2 text-sm text-slate-500">
                <div>• 岗位要求不用全贴，只贴岗位职责和任职要求即可。</div>
                <div>• 如果你只想分析某一段经历，也可以只补那一段。</div>
                <div>• 你提交的内容仅用于本次诊断与结果保存。</div>
              </div>

              <div className="mt-8 space-y-3">
                <button className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-base font-semibold text-white">开始诊断</button>
                <button className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base font-medium text-slate-800">先看示例</button>
                <div className="text-center text-xs text-slate-400">通常只需要几十秒</div>
              </div>
            </div>
          </div>
        </section>

        <section className={section}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">结果页高保真草稿</h2>
              <p className="mt-1 text-sm text-slate-500">主判断前置，右侧 sticky 控制台，增强版 Before / After 对比。</p>
            </div>
            <span className={chip}>Results Page</span>
          </div>
          <div className={`${card} px-8 py-10`}>
            <div className="grid grid-cols-12 gap-8">
              <div className="col-span-8 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-semibold">诊断结果</div>
                    <div className="mt-1 text-sm text-slate-500">基于你提交的目标岗位、岗位要求和经历内容生成</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">保存结果</button>
                    <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800">重新诊断</button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
                  <div className="text-sm font-medium text-slate-500">当前主问题</div>
                  <div className="mt-3 text-4xl font-semibold leading-[1.2] tracking-tight">当前投递无反馈的主因更偏“岗位匹配表达不清”</div>
                  <div className="mt-5 flex gap-2">
                    <span className={chip}>匹配问题</span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">表达问题</span>
                  </div>
                </div>

                <div className="rounded-xl bg-blue-50 px-5 py-4 text-sm leading-6 text-slate-700">
                  先不用急着否定自己。投递无反馈不一定代表你没有能力，更常见的是表达、匹配或投递方式存在阻塞点。下面这份结果会先帮你定位最值得优先解决的问题。
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-sm font-medium text-slate-500">你现在最该先做的一步</div>
                  <div className="mt-3 text-xl font-semibold leading-8">先重写最相关的一段经历，把职责描述改成“动作 + 结果”的表达。</div>
                  <div className="mt-3 text-sm leading-6 text-slate-600">因为当前岗位要求中的关键能力，在你的简历里没有被快速看出来。</div>
                  <button className="mt-4 text-sm font-medium text-blue-700">增强版可直接生成这段经历的改写候选</button>
                </div>

                <div>
                  <div className="mb-4 text-xl font-semibold">你当前最明确的两个问题</div>
                  <div className="grid grid-cols-2 gap-4">
                    {[1,2].map((i) => (
                      <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6">
                        <div className="text-base font-semibold">缺少与岗位要求直接对应的结果证据</div>
                        <div className="mt-3 text-sm leading-6 text-slate-600">岗位要求强调活动复盘与数据意识，但当前经历主要描述执行动作，缺少结果表达。</div>
                        <div className="mt-3 text-sm leading-6 text-slate-500">这会增加招聘方在初筛阶段理解你岗位相关性的成本。</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-lg font-semibold">更容易建立反馈的相邻方向</div>
                  <div className="mt-3 text-sm leading-6 text-slate-600">如果你暂时继续投当前岗位阻力较大，可以优先关注更容易放大你现有执行与协作优势的相邻岗位方向。增强版中会继续说明哪条路径更低阻力。</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
                  <div className="text-xl font-semibold">继续查看完整执行方案</div>
                  <div className="mt-2 text-sm leading-6 text-slate-600">基础诊断已经帮你定位到主要阻塞点。继续解锁后，你将获得可直接使用的改写候选和更具体的行动支持。</div>
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    {[
                      "可直接复制的经历改写候选",
                      "优先修改顺序",
                      "面试追问防御提醒",
                      "一次重生成兜底",
                    ].map((t) => (
                      <div key={t} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700">{t}</div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-3">
                    <button className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">9.9 元解锁增强版</button>
                    <button className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800">查看增强版示例</button>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">内测期支持单次解锁，无需订阅。</div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="text-xl font-semibold">这段经历可以这样改</div>
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="text-sm font-medium text-slate-500">你的原句</div>
                      <div className="mt-3 text-sm leading-7 text-slate-500">负责活动策划与执行，跟进现场落地，配合团队完成活动相关工作。</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="text-sm font-medium text-slate-500">优化后版本 A</div>
                      <div className="mt-3 text-sm leading-7 text-slate-800">
                        负责活动策划与落地执行，<span className="rounded bg-blue-50 px-1 text-blue-700">协同跨团队推进</span>现场流程，活动结束后完成<span className="rounded bg-blue-50 px-1 text-blue-700">复盘与效果整理</span>，帮助团队更快定位后续优化方向。
                      </div>
                      <div className="mt-4 flex gap-3 text-sm font-medium">
                        <button className="text-blue-700">复制</button>
                        <button className="text-slate-600">这个更像我</button>
                        <button className="text-slate-600">不够准确</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-4">
                <div className="sticky top-24 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_24px_rgba(0,0,0,0.04)]">
                  <div>
                    <div className="text-sm font-medium text-slate-500">本次结果摘要</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <div>主问题：岗位匹配表达不清</div>
                      <div>最该先做：重写最相关的一段经历</div>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <div className="text-sm font-medium text-slate-500">解锁后可获得</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <div>• 可直接复制的改写候选</div>
                      <div>• 优先修改顺序</div>
                      <div>• 面试追问防御提醒</div>
                    </div>
                  </div>
                  <button className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">9.9 元解锁增强版</button>
                  <div className="space-y-2">
                    <button className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800">保存结果</button>
                    <button className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800">重新诊断</button>
                    <button className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800">查看历史记录</button>
                  </div>
                  <div className="text-xs leading-5 text-slate-400">增强版更适合想直接开始修改的人。</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
