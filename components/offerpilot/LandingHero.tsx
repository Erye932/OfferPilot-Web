"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CommonNav from "@/components/offerpilot/CommonNav";

const scanWords = ["Expression", "Matching", "Direction", "Feedback"];

export default function LandingHero() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % scanWords.length);
    }, 1600);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="relative overflow-hidden pt-6 sm:pt-8">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(60%_0.15_250/0.05),transparent_38%)]" />

        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [mask-image:radial-gradient(circle_at_center,black_0%,rgba(0,0,0,0.88)_38%,transparent_76%)]">
          <div
            className="hero-grid-breathe absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(to right, oklch(60%_0.15_250/0.15) 1px, transparent 1px),
                linear-gradient(to bottom, oklch(60%_0.15_250/0.15) 1px, transparent 1px)
              `,
              backgroundSize: "48px 48px",
            }}
          />
        </div>
      </div>

      <style jsx>{`
        .hero-grid-breathe {
          animation: heroGridBreathe 6s ease-in-out infinite;
        }

        @keyframes heroGridBreathe {
          0%,
          100% {
            opacity: 0.16;
            transform: scale(1);
          }
          50% {
            opacity: 0.22;
            transform: scale(1.15);
          }
        }
      `}</style>

      <CommonNav
        variant="landing"
        navItems={[
          { label: "首页", href: "/" },
          { label: "岗位推荐", href: "/recommendations" },
          { label: "面试追问", href: "/interview" },
          { label: "示例结果", href: "/demo/result" },
        ]}
        authButtonClassName="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="flex items-center justify-center text-xs font-bold tracking-widest uppercase text-neutral-500">
          <span className="mr-3 text-neutral-400">Scanning</span>
          <span className="relative inline-flex min-w-[120px] justify-start text-primary">
            {scanWords.map((word, index) => (
              <span
                key={word}
                className={`absolute left-0 top-1/2 -translate-y-1/2 transition-all duration-300 ease-out ${
                  index === activeIndex
                    ? "translate-y-[-50%] opacity-100"
                    : "translate-y-[20%] opacity-0"
                }`}
              >
                {word}
              </span>
            ))}
          </span>
        </div>

        <h1 className="mt-8 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl animate-in fade-in duration-500 delay-300">
          停止盲目海投
          <br />
          先找出问题出在哪
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600 sm:text-lg animate-in fade-in duration-500 delay-500">
          帮你判断问题更偏表达、匹配还是方向
        </p>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row animate-in fade-in duration-500 delay-700">
          <Link
            href="/diagnose"
            className="inline-flex h-12 min-w-[160px] items-center justify-center rounded-md bg-neutral-900 px-6 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            开始诊断
          </Link>

          <Link
            href="/demo/result"
            className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            查看示例结果
          </Link>
        </div>
      </div>
    </section>
  );
}
