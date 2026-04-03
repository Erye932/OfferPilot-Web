"use client";

import CommonNav from "@/components/offerpilot/CommonNav";

interface AppTopNavProps {
  current:
    | "home"
    | "recommendations"
    | "interview"
    | "sample"
    | "diagnose"
    | "result";
}

export default function AppTopNav({ current }: AppTopNavProps) {
  return (
    <CommonNav
      current={current}
      variant="app"
      authButtonClassName="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    />
  );
}
