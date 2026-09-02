"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface AuthModalProps {
  buttonClassName?: string;
  buttonLabel?: string;
}

export default function AuthModal({
  buttonClassName,
  buttonLabel = "登录",
}: AuthModalProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [mounted, setMounted] = useState(false);
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const eyeTargetRef = useRef({ x: 0, y: 0 });
  const eyeAnimFrameRef = useRef<number>(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { const timer = setTimeout(() => setMounted(true), 0); return () => clearTimeout(timer); }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus(); } }
        else { if (document.activeElement === last) { e.preventDefault(); first?.focus(); } }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open && dialogRef.current) {
      const input = dialogRef.current.querySelector<HTMLElement>("input");
      if (input) setTimeout(() => input.focus(), 50);
    }
  }, [open, mode]);

  const startEyeLerp = useCallback(() => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const tick = () => {
      setEyePosition((prev) => {
        const nx = lerp(prev.x, eyeTargetRef.current.x, 0.10);
        const ny = lerp(prev.y, eyeTargetRef.current.y, 0.10);
        if (Math.abs(nx - eyeTargetRef.current.x) < 0.05 && Math.abs(ny - eyeTargetRef.current.y) < 0.05) {
          return eyeTargetRef.current;
        }
        eyeAnimFrameRef.current = requestAnimationFrame(tick);
        return { x: nx, y: ny };
      });
    };
    cancelAnimationFrame(eyeAnimFrameRef.current);
    eyeAnimFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = e.clientX - rect.left - cx;
    const dy = e.clientY - rect.top - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxD = Math.min(cx, cy) * 0.65;
    const scale = dist > maxD ? maxD / dist : 1;
    eyeTargetRef.current = { x: dx * scale, y: dy * scale };
    startEyeLerp();
  }, [startEyeLerp]);

  const handleMouseLeave = useCallback(() => {
    eyeTargetRef.current = { x: 0, y: 0 };
    startEyeLerp();
  }, [startEyeLerp]);

  const handleClose = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const modalContent = open ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "login" ? "登录" : "注册"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-950/30 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      {/* Card: 纯粹方正纸片质感，去除多余线条与圆弧 */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-[380px] bg-white border border-neutral-200 shadow-2xl rounded-none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Top: eye zone ── */}
        <div
          className="relative flex items-center justify-center h-[180px] cursor-default bg-neutral-50 border-b border-neutral-100"
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="关闭"
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center text-neutral-400 hover:text-neutral-900 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          {/* Two eyes */}
          <div className="flex items-center" style={{ gap: 16 }}>
            <EyeBall dx={eyePosition.x} dy={eyePosition.y} size={96} />
            <EyeBall dx={eyePosition.x} dy={eyePosition.y} size={96} />
          </div>
        </div>

        {/* ── Bottom: form zone ── */}
        <div className="p-7 bg-white space-y-5">
          {/* Brand & Mode tabs */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-4">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`text-sm tracking-wider uppercase transition-colors ${
                    mode === m 
                      ? 'font-bold text-neutral-950' 
                      : 'font-normal text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {m === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono tracking-widest text-neutral-400 uppercase">
              OfferPilot
            </span>
          </div>

          {/* Inputs: 极简 1px 细线，无圆弧，去除蓝底厚环 */}
          <div className="space-y-3">
            <FlatInput type="email" placeholder="邮箱地址" />
            <FlatInput type="password" placeholder="密码" />
            {mode === "register" && <FlatInput type="password" placeholder="确认密码" />}
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-1">
            <button
              className="w-full py-3 text-xs font-bold tracking-widest uppercase bg-neutral-950 text-white hover:bg-neutral-800 transition-colors rounded-none"
            >
              {mode === "login" ? "立即登录" : "创建账号"}
            </button>

            {/* Anonymous: 纯文本链接，去除多余按钮线框 */}
            <button
              onClick={handleClose}
              className="w-full py-1.5 text-xs text-neutral-500 hover:text-neutral-900 transition-colors text-center font-medium block"
            >
              先匿名体验 ➔
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "rounded-none border border-neutral-300 bg-white px-4 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-900 hover:text-neutral-950"
        }
      >
        {buttonLabel}
      </button>
      {mounted && modalContent && createPortal(modalContent, document.body)}
    </>
  );
}

// ─── Flat input — 纯净极简输入框（无圆弧，单层轻量细线，无多余外圈蓝线） ───────────────
function FlatInput({ type, placeholder }: { type: string; placeholder: string }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      className="w-full rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-950 outline-none transition-colors"
      style={{ outline: "none", boxShadow: "none" }}
    />
  );
}

// ─── Eyeball ─────────────────────────────────────────────────
function EyeBall({ dx, dy, size }: { dx: number; dy: number; size: number }) {
  const w = size * 0.88;
  const h = size;
  const pupilW = w * 0.33;
  const pupilH = h * 0.38;
  const maxTravelX = w * 0.32;
  const maxTravelY = h * 0.28;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxD = Math.sqrt(maxTravelX * maxTravelX + maxTravelY * maxTravelY);
  const scale = dist > maxD ? maxD / dist : 1;
  const px = dx * scale;
  const py = dy * scale;

  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: "50%",
        background: "#FFFFFF",
        border: "1px solid #E5E5E5",
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: pupilW,
          height: pupilH,
          borderRadius: "50%",
          background: "#171717",
          top: "50%",
          left: "50%",
          transform: `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`,
        }}
      />
    </div>
  );
}
