"use client";

import dynamic from "next/dynamic";

// The planner reads localStorage and WebGL on first render, so it only runs in the browser.
const Planner = dynamic(() => import("./Planner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-stone-100">
      <div className="flex items-center gap-3 text-[13px] text-stone-500">
        <span className="size-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        Loading room planner…
      </div>
    </div>
  ),
});

export default function PlannerLoader() {
  return <Planner />;
}
