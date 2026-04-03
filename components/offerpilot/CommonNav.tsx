"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthModal from "@/components/offerpilot/AuthModal";

export interface NavItem {
  key?: string;
  label: string;
  href: string;
}

export interface CommonNavProps {
  /** 导航项列表，如果未提供则使用默认值 */
  navItems?: NavItem[];
  /** 当前激活的页面 key（可选） */
  current?: string;
  /** 是否显示在 landing 页面（影响一些样式细节） */
  variant?: "landing" | "app";
  /** AuthModal 按钮的类名（可选） */
  authButtonClassName?: string;
  /** 是否显示品牌 Logo 链接 */
  showBrand?: boolean;
  /** 品牌链接的类名（可选） */
  brandClassName?: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { key: "home", label: "首页", href: "/" },
  { key: "recommendations", label: "岗位推荐", href: "/recommendations" },
  { key: "interview", label: "面试追问", href: "/interview" },
  { key: "sample", label: "示例结果", href: "/demo/result" },
];

export default function CommonNav({
  navItems = DEFAULT_NAV_ITEMS,
  current,
  variant = "app",
  authButtonClassName,
  showBrand = true,
  brandClassName,
}: CommonNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // ESC 键关闭移动菜单
  useEffect(() => {
    if (!mobileOpen) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [mobileOpen]);

  // 根据 variant 决定样式变量
  const borderColor = variant === "landing" ? "border-neutral-200" : "border-neutral-300";
  const hoverBorderColor = variant === "landing" ? "hover:border-neutral-400" : "hover:border-neutral-500";
  const mobileMenuBorderColor = variant === "landing" ? "border-neutral-200" : "border-neutral-300";
  const mobileMenuTop = variant === "landing" ? "top-20" : "top-16";
  const mobileMenuRounded = variant === "landing" ? "rounded-xl" : "rounded-lg";

  // 检查是否是激活状态
  const isActive = (item: NavItem) => {
    if (!current) return false;
    return item.key ? current === item.key : false;
  };

  return (
    <>
      <header className={variant === "landing" ? "relative z-10" : "border-b border-neutral-200 bg-white"}>
        <div className={`mx-auto flex items-center justify-between gap-6 py-2 ${variant === "landing" ? "max-w-6xl" : "h-14 w-full max-w-7xl px-4 sm:px-6 lg:px-8"}`}>
          {showBrand && (
            <Link
              href="/"
              className={brandClassName || "text-lg font-semibold tracking-tight text-neutral-900 transition hover:text-neutral-700"}
            >
              OFFERPILOT
            </Link>
          )}

          <div className="hidden items-center gap-6 md:flex">
            <nav className="flex items-center gap-6 text-sm text-neutral-600">
              {navItems.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.key || item.href}
                    href={item.href}
                    className={
                      current
                        ? active
                          ? "font-medium text-neutral-900"
                          : "font-medium text-neutral-600 transition hover:text-neutral-900"
                        : "transition hover:text-neutral-900"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <AuthModal
              buttonClassName={
                authButtonClassName ||
                `rounded-md border ${borderColor} bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition ${hoverBorderColor} hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`
              }
            />
          </div>

          {/* 移动端汉堡按钮 */}
          <button
            type="button"
            aria-label={mobileOpen ? "关闭导航" : "打开导航"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((prev) => !prev)}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-md border ${borderColor} bg-white text-neutral-700 transition ${hoverBorderColor} hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden`}
          >
            {mobileOpen ? (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* 移动端菜单 */}
      {mobileOpen && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-40 bg-neutral-900/15"
            onClick={() => setMobileOpen(false)}
          />
          <div className={`fixed inset-x-4 ${mobileMenuTop} z-50 ${mobileMenuRounded} border ${mobileMenuBorderColor} bg-white p-6`}>
            <nav className="flex flex-col gap-0.5">
              {navItems.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.key || item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={
                      current && active
                        ? `rounded-md bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-900`
                        : `rounded-md px-4 py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className={`mt-4 border-t ${borderColor} pt-4`}>
              <AuthModal
                buttonLabel="登录"
                buttonClassName={`w-full rounded-md border ${borderColor} bg-white px-4 py-3 text-sm font-medium text-neutral-700 transition ${hoverBorderColor} hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}