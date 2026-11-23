/** Every 3D view has a list alternative. Reduced-motion users start in list view. */
import { Box, List } from "lucide-react";
import { useState } from "react";

export type ViewMode = "3d" | "list";

export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return useState<ViewMode>(reduce ? "list" : "3d");
}

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div role="group" aria-label="View as" className="inline-flex bg-subtle rounded-full p-1">
      {(["3d", "list"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onChange(m)}
          className={`inline-flex items-center gap-1.5 min-h-10 px-4 rounded-full text-sm font-semibold transition-colors duration-[var(--dur-fast)] ${mode === m ? "bg-white shadow-sm" : "text-ink-2"}`}
        >
          {m === "3d" ? <Box size={16} aria-hidden="true" /> : <List size={16} aria-hidden="true" />}
          {m === "3d" ? "3D" : "List"}
        </button>
      ))}
    </div>
  );
}
