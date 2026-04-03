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
        className="absolute inset-0 bg-neutral-900/20"
        onClick={handleClose}
      />

      {/* Card */}
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-[400px] overflow-hidden bg-white border border-neutral-300"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ── Top: eye zone ── */}
        <div
          className="relative flex items-center justify-center h-[200px] cursor-default bg-neutral-100"
        >
          {/* Close button — top right */}
          <button
            onClick={handleClose}
            aria-label="关闭"
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center border border-neutral-300 bg-white hover:bg-neutral-100 transition rounded text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          {/* Two eyes */}
          <div className="flex items-center" style={{ gap: 16 }}>
            <EyeBall dx={eyePosition.x} dy={eyePosition.y} size={110} />
            <EyeBall dx={eyePosition.x} dy={eyePosition.y} size={110} />
          </div>
        </div>

        {/* ── Bottom: form zone ── */}
        <div className="px-6 pb-6 pt-4 bg-white">
          {/* Brand label */}
          <div className="border-b border-neutral-300 pb-3 mb-4">
            <div className="text-3xl font-black tracking-tight text-neutral-900">
              #0062AD
            </div>
            <div className="mt-0.5 text-xs font-semibold tracking-[0.2em] uppercase text-neutral-600">
              OFFERPILOT
            </div>
          </div>

          {/* Mode tabs */}
          <div className="mb-4 flex gap-0 border-b border-neutral-300">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`pb-2 pr-4 text-xs font-black tracking-[0.18em] uppercase transition ${mode === m ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
                style={{
                  marginBottom: -2,
                  background: "transparent",
                }}
              >
                {m === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <FlatInput type="email" placeholder="邮箱地址" />
            <FlatInput type="password" placeholder="密码" />
            {mode === "register" && <FlatInput type="password" placeholder="确认密码" />}
          </div>

          {/* Primary button */}
          <button
            className="mt-4 w-full py-3 text-xs font-black tracking-[0.2em] uppercase transition bg-neutral-900 text-white hover:bg-neutral-800 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {mode === "login" ? "立即登录" : "创建账号"}
          </button>

          {/* Anonymous */}
          <button
            onClick={handleClose}
            className="mt-2 w-full py-2 text-xs font-semibold tracking-widest uppercase transition border border-neutral-300 text-neutral-600 hover:border-neutral-500 hover:text-neutral-800 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            先匿名体验
          </button>
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
          "rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        }
      >
        {buttonLabel}
      </button>
      {mounted && modalContent && createPortal(modalContent, document.body)}
    </>
  );
}

// ─── Flat input — modern SaaS style ────────────────────
function FlatInput({ type, placeholder }: { type: string; placeholder: string }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      className="w-full rounded-md border border-primary bg-white px-3 py-2 text-sm text-neutral-900 transition focus:border-primary focus:ring-2 focus:ring-primary focus:ring-offset-0 outline-none"
    />
  );
}

// ─── Eyeball ─────────────────────────────────────────────────
function EyeBall({ dx, dy, size }: { dx: number; dy: number; size: number }) {
  const w = size * 0.88; // slightly oval — taller than wide
  const h = size;
  const pupilW = w * 0.33;
  const pupilH = h * 0.38;
  // generous travel so the effect is clearly visible
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
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
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
