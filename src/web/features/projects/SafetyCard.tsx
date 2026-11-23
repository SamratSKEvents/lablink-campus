/** Guardian hazard check: staff rules merged with AI flags (AI can only add caution). */
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { Safety } from "../../lib/types";
import { Chip, type Tone } from "../../components/ui";

const LEVEL: Record<Safety["level"], { tone: Tone; label: string }> = {
  none: { tone: "green", label: "No special hazards" },
  low: { tone: "green", label: "Low hazard" },
  medium: { tone: "yellow", label: "Medium hazard" },
  high: { tone: "red", label: "High hazard" },
};

export function SafetyCard({ safety, source, action }: { safety: Safety; source?: string; action?: React.ReactNode }) {
  const lvl = LEVEL[safety.level];
  const Icon = safety.level === "high" || safety.level === "medium" ? ShieldAlert : ShieldCheck;
  return (
    <section className="section grid gap-4" aria-labelledby="safety-title">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`appicon tone-${lvl.tone}`} aria-hidden="true">
          <Icon size={22} />
        </span>
        <h2 id="safety-title" className="flex-1 !text-2xl">Safety check</h2>
        <Chip tone={lvl.tone}>{lvl.label}</Chip>
        {safety.reviewRequired && <Chip tone="violet">Faculty safety review</Chip>}
      </div>
      {safety.hazards.length > 0 && (
        <div>
          <p className="font-semibold text-sm mb-1">Hazards</p>
          <ul className="list-disc pl-5 grid gap-1">{safety.hazards.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}
      {safety.precautions.length > 0 && (
        <div>
          <p className="font-semibold text-sm mb-1">Precautions</p>
          <ul className="list-disc pl-5 grid gap-1">{safety.precautions.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}
      {safety.ppe.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {safety.ppe.map((p) => (
            <Chip key={p} tone="neutral" dot={false}>🥽 {p}</Chip>
          ))}
        </div>
      )}
      <p className="meta">
        Staff hazard rules{source && source !== "fallback" ? " plus a Gemini review" : ""}. AI can add caution, never remove it.
      </p>
      {action}
    </section>
  );
}
