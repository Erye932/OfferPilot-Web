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
  navItems?: NavItem[];
  current?: string;
  variant?: "landing" | "app";
  authButtonClassName?: string;
  showBrand?: boolean;
  brandClassName?: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { key: "diagnose", label: "开始诊断", href: "/diagnose" },
  { label: "学校端", href: "/school/dashboard" },
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

  const borderColor = "border-neutral-200";
  const hoverBorderColor = "hover:border-neutral-900";

  const isActive = (item: NavItem) => {
    if (!current) return false;
    return item.key ? current === item.key : false;
  };

  return (
    <>
      <header className="sticky top-0 z-40 h-14 border-b border-neutral-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {showBrand && (
            <Link
              href="/"
              className={brandClassName || "flex items-center gap-2.5 text-sm font-bold tracking-tight text-neutral-950"}
            >
              <span className="h-2 w-2 bg-neutral-950" />
              OfferPilot
            </Link>
          )}

          <div className="hidden items-center gap-8 md:flex">
            <nav className="flex items-center gap-6 text-xs font-medium text-neutral-600">
              {navItems.map((item, index) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.key || `${item.href}-${index}`}
                    href={item.href}
                    className={
                      active
                        ? "text-neutral-950 font-bold border-b border-neutral-950 pb-0.5"
                        : "transition hover:text-neutral-950"
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
                `border ${borderColor} bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-900 transition-colors ${hoverBorderColor} hover:bg-neutral-50`
              }
            />
          </div>

          {/* 移动端汉堡按钮 */}
          <button
            type="button"
            aria-label={mobileOpen ? "关闭导航" : "打开导航"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((prev) => !prev)}
            className={`inline-flex h-9 w-9 items-center justify-center border ${borderColor} bg-white text-neutral-900 transition-colors ${hoverBorderColor} md:hidden`}
          >
            {mobileOpen ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
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
            className="fixed inset-0 z-40 bg-neutral-900/20"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-x-0 top-14 z-50 border-b border-neutral-200 bg-white p-6 shadow-sm">
            <nav className="flex flex-col gap-2">
              {navItems.map((item, index) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.key || `${item.href}-${index}`}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={
                      active
                        ? "bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-950"
                        : "px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 hover:text-neutral-950"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-4 border-t border-neutral-100 pt-4">
              <AuthModal
                buttonLabel="登录"
                buttonClassName="w-full border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-900 transition-colors hover:border-neutral-900"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}