/** A dismissible four-step tour for judges: plan → fair conflict → Rescue Mode → SOS. */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const STEPS = [
  { title: "Plan a project", body: "As the student, open “Robotic arm” to see its Feasibility Passport, or start a new project and watch Gemini plan it.", to: "/projects", cta: "My projects" },
  { title: "Resolve a live conflict", body: "Sign in as Admin and run Finals Week: five students, one oscilloscope, a fair and explained decision.", to: "/admin", cta: "Overview" },
  { title: "Break an instrument", body: "Sign in as the Technician and mark a booked unit out of service. Rescue Mode re-plans every affected project.", to: "/tech", cta: "Technician" },
  { title: "Press SOS", body: "Hold the SOS button (or press Alt+S). Call 112 stays the biggest action, and the demo sends no real alert.", to: "/session", cta: "Lab session" },
];

const KEY = "lablink.tour.dismissed";
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

export function JudgeTour() {
  const [hidden, setHidden] = useState(read);
  const [i, setI] = useState(0);
  if (hidden) return null;
  const step = STEPS[i]!;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: dismissal lasts this page view */
    }
  };
  return (
    <aside aria-label="Judge tour" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(640px,calc(100vw-32px))] card !p-4 enter" style={{ boxShadow: "var(--shadow-float)" }}>
      <div className="flex items-start gap-3">
        <span className="chip tone-yellow shrink-0" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
          {i + 1}/{STEPS.length}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{step.title}</p>
          <p className="meta">{step.body}</p>
        </div>
        <button type="button" className="btn btn-soft !p-0 !w-11 !h-11 shrink-0" onClick={dismiss} aria-label="Close the tour">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex justify-between items-center mt-3 gap-2">
        <button type="button" className="btn btn-soft btn-sm" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous step">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <Link to={step.to} className="btn btn-yellow btn-sm">
          {step.cta}
        </Link>
        <button type="button" className="btn btn-soft btn-sm" disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)} aria-label="Next step">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
