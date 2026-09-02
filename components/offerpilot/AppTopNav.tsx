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
      authButtonClassName="op-link"
    />
  );
}
