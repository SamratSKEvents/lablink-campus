/** "Why X got this slot": score breakdown per candidate, filtered candidates, alternatives. */
import { formatRange } from "@shared/time";
import type { Decision } from "../../lib/types";
import { AiNote, Chip } from "../../components/ui";

const FACTORS = [
  { key: "deadline", label: "Deadline urgency", max: 35, color: "var(--orange)" },
  { key: "stage", label: "Project stage", max: 20, color: "var(--violet)" },
  { key: "usage", label: "Less recent use", max: 20, color: "var(--green)" },
  { key: "wait", label: "Waiting time", max: 15, color: "var(--yellow)" },
  { key: "fit", label: "Equipment fit", max: 10, color: "var(--blue)" },
] as const;

export function DecisionCard({ decision, names, equipmentName, highlightUserId }: { decision: Decision; names: Record<string, string>; equipmentName?: string; highlightUserId?: string }) {
  const winner = decision.override?.winnerUserId ?? decision.winnerUserId;
  const ranked = [...decision.candidates].sort((a, b) => (b.scores?.total ?? -1) - (a.scores?.total ?? -1));
  return (
    <article className="card grid gap-5" aria-labelledby={`dec-${decision.id}`}>
      <div>
        <h2 id={`dec-${decision.id}`} className="!text-2xl">
          {winner ? `Why ${names[winner] ?? "the winner"} got ${formatRange(decision.start, decision.end)}` : "Nobody could take this slot"}
        </h2>
        {equipmentName && <p className="meta mt-1">{equipmentName} · policy {decision.policyVersion}</p>}
      </div>
      {decision.override && (
        <p className="chip tone-violet !whitespace-normal">
          <span className="dot" aria-hidden="true" />
          Admin override: {decision.override.reason}
        </p>
      )}
      <ol className="grid gap-4">
        {ranked.map((c, i) => (
          <li key={c.userId} className={`rounded-2xl p-4 ${c.userId === highlightUserId ? "bg-yellow-tint" : "bg-subtle"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="font-semibold">
                {i + 1}. {names[c.userId] ?? "Student"}
              </p>
              {c.eligible ? (
                <div className="flex gap-2 items-center">
                  {c.userId === winner && <Chip tone="green">Got the slot</Chip>}
                  <span className="font-display text-2xl" aria-label={`Total score ${c.scores!.total}`}>{c.scores!.total}</span>
                </div>
              ) : (
                <Chip tone="red">Not eligible</Chip>
              )}
            </div>
            {c.eligible && c.scores ? (
              <div className="grid gap-1.5">
                {FACTORS.map((f) => {
                  const v = c.scores![f.key];
                  return (
                    <div key={f.key} className="grid grid-cols-[minmax(110px,150px)_1fr_36px] gap-3 items-center text-sm">
                      <span>{f.label}</span>
                      <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={f.max} aria-valuenow={v} aria-label={f.label}>
                        <i style={{ width: `${(v / f.max) * 100}%`, background: f.color, animationDelay: `${i * 40}ms` }} />
                      </div>
                      <b className="text-right">{v}</b>
                    </div>
                  );
                })}
                {(c.scores.unblocks > 0 || c.scores.noShowPenalty < 0) && (
                  <p className="meta mt-1">
                    {c.scores.unblocks > 0 && `+${c.scores.unblocks} for unblocking the whole project. `}
                    {c.scores.noShowPenalty < 0 && `${c.scores.noShowPenalty} for recent no-shows.`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm">{c.filteredBy}</p>
            )}
            {decision.alternatives[c.userId]?.length ? (
              <div className="mt-3 grid gap-1">
                <p className="text-sm font-semibold">Offered instead</p>
                {decision.alternatives[c.userId]!.map((a) => (
                  <p key={`${a.kind}-${a.equipmentId}-${a.start}`} className="text-sm">• {a.note} {a.kind !== "shared" && <span className="meta">({formatRange(a.start, a.end)})</span>}</p>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <AiNote source={decision.explanationSource === "ai" ? "gemini" : "template"}>{decision.explanation}</AiNote>
      <p className="meta">Gemini explains decisions. It never makes them. Any student can appeal to faculty.</p>
    </article>
  );
}
