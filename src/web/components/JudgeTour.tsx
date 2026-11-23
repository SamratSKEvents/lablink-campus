/**
 * Demo guide for judges: a small header button that opens a checklist of the four
 * story beats (plan → fair conflict → Rescue Mode → SOS), with the card to use for each.
 * It never covers the page. Progress is remembered per browser (best effort).
 */
import { Popover } from "@base-ui/react/popover";
import { Check, Compass } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/auth";

const STEPS = [
  { id: "plan", title: "Plan a project", body: "Open “Robotic arm” for its Feasibility Passport, or plan a new project and watch Gemini draft it.", role: "student", card: "Student card", to: "/projects" },
  { id: "fair", title: "Resolve a live conflict", body: "Run Finals Week: five students, one oscilloscope, a fair and explained decision.", role: "admin", card: "Admin card · PIN 9999", to: "/admin" },
  { id: "rescue", title: "Break an instrument", body: "Open a booked unit, change its status to out of service. Rescue Mode re-plans every affected project.", role: "technician", card: "Technician card · PIN 1357", to: "/tech" },
  { id: "sos", title: "Press SOS", body: "Hold the SOS button or press Alt+S. Call 112 stays biggest; the demo sends no real alert.", role: "student", card: "Student card", to: "/session" },
] as const;

const KEY = "lablink.guide.done";
const load = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

export function JudgeTour() {
  const { user, signOut } = useSession();
  const [done, setDone] = useState<string[]>(load);
  const mark = (id: string) => {
    const next = [...new Set([...done, id])];
    setDone(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: progress lasts this page view */
    }
  };
  return (
    <Popover.Root>
      <Popover.Trigger className="btn btn-soft btn-sm !px-3" aria-label={`Demo guide, ${done.length} of ${STEPS.length} done`}>
        <Compass size={16} aria-hidden="true" className="text-yellow-ink" />
        <span className="hidden xl:inline">Demo guide</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-40">
          <Popover.Popup
            className="card !p-5 w-[min(400px,calc(100vw-32px))] origin-[var(--transform-origin)] transition-all duration-[var(--dur-base)] ease-[var(--ease-enter)] data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:duration-[var(--dur-fast)]"
            style={{ boxShadow: "var(--shadow-float)" }}
          >
            <Popover.Title className="font-display text-2xl">The 2-minute demo</Popover.Title>
            <Popover.Description className="meta mt-1">Four moments that show what LabLink does. Switch cards with “Sign out”.</Popover.Description>
            <ol className="rows mt-4">
              {STEPS.map((s, i) => {
                const here = user?.role === s.role;
                const isDone = done.includes(s.id);
                return (
                  <li key={s.id} className="py-3 flex gap-3">
                    <span className={`shrink-0 w-7 h-7 rounded-full grid place-items-center text-sm font-bold ${isDone ? "bg-green text-ink" : "bg-subtle"}`} aria-hidden="true">
                      {isDone ? <Check size={14} /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">
                        {s.title}
                        {isDone && <span className="sr-only"> (done)</span>}
                      </p>
                      <p className="meta">{s.body}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {here ? (
                          <Link to={s.to} className="btn btn-primary btn-sm" onClick={() => mark(s.id)}>
                            Go
                          </Link>
                        ) : (
                          <button type="button" className="btn btn-soft btn-sm" onClick={() => void signOut()}>
                            Switch to {s.card}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
