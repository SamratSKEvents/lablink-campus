/**
 * Faculty approval queue. The copilot summarises, flags risks and suggests;
 * the faculty member decides (with PIN), verifies deadline and stage, and must give
 * a reason for any rejection.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { classLabel } from "@shared/catalogue";
import { formatDay } from "@shared/time";
import { api, post } from "../../lib/api";
import type { Project, User } from "../../lib/types";
import { AiNote, Chip, Empty, ErrorNote, Loading, PageHeader, PinDialog, useToast } from "../../components/ui";

interface Item {
  request: { id: string; safetyLevel: string; reviewRequired: boolean; createdAt: string };
  project: Project;
  owner: User;
  copilot: { summary: string; riskFlags: string[]; suggestion: "approve" | "approve_with_conditions" | "needs_discussion"; conditions?: string[] };
  copilotSource: string;
}

const SUGGESTION = { approve: "Suggests approving", approve_with_conditions: "Suggests approving with conditions", needs_discussion: "Suggests a conversation first" } as const;

export default function Approvals() {
  const { data, isLoading, error } = useQuery({ queryKey: ["approvals"], queryFn: () => api<{ items: Item[] }>("/approvals") });
  return (
    <>
      <PageHeader title="Approvals" lead="One request per project, covering every piece of equipment. Approval grants permission. Slots are checked again at booking." />
      <ErrorNote error={error} />
      {isLoading && <Loading />}
      {data?.items.length === 0 && <Empty title="All clear">No requests are waiting for you.</Empty>}
      <ul className="grid gap-6 stagger">
        {data?.items.map((it) => (
          <li key={it.request.id}>
            <ApprovalCard item={it} />
          </li>
        ))}
      </ul>
    </>
  );
}

function ApprovalCard({ item }: { item: Item }) {
  const { project: p, owner, copilot, request } = item;
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [verify, setVerify] = useState(true);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const qc = useQueryClient();
  const toast = useToast();
  const hours = p.tasks.reduce((s, t) => s + t.durationMin, 0) / 60;

  return (
    <article className="card grid gap-4" aria-labelledby={`ap-${request.id}`}>
      <div className="flex flex-wrap justify-between gap-3 items-start">
        <div>
          <h2 id={`ap-${request.id}`} className="!text-2xl">
            <Link to={`/projects/${p.id}`} className="hover:underline underline-offset-4">{p.title}</Link> <span aria-hidden="true">{p.emoji}</span>
          </h2>
          <p className="meta mt-1">{owner.name} · {p.stage} · due {formatDay(p.deadline)} · {hours.toFixed(1)} lab hours</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.reviewRequired && <Chip tone="violet">Safety review</Chip>}
          <Chip tone={request.safetyLevel === "high" ? "red" : request.safetyLevel === "medium" ? "yellow" : "green"}>{request.safetyLevel} hazard</Chip>
        </div>
      </div>
      <AiNote source={item.copilotSource} label="Copilot">
        {copilot.summary} <b className="!text-ink">{SUGGESTION[copilot.suggestion]}.</b>
        {copilot.riskFlags.length > 0 && (
          <ul className="list-disc pl-5 mt-2">
            {copilot.riskFlags.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
      </AiNote>
      <ol className="flex flex-wrap gap-2" aria-label="Lab steps">
        {p.tasks.map((t, i) => (
          <li key={t.id}><Chip tone="neutral" dot={false}>{i + 1}. {t.name} · {classLabel(t.classId)}</Chip></li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-primary" onClick={() => setMode("approve")}>Approve</button>
        <button className="btn btn-soft" onClick={() => setMode("reject")}>Request changes</button>
      </div>
      <PinDialog
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "approve" ? `Approve ${p.title}` : `Request changes to ${p.title}`}
        confirmLabel={mode === "approve" ? "Approve" : "Send back to student"}
        onConfirm={async (pin) => {
          await post(`/approvals/${request.id}`, { decision: mode, pin, verifyDeadlineAndStage: mode === "approve" && verify, ...(mode === "reject" ? { reason } : {}) });
          toast.success(mode === "approve" ? "Approved" : "Sent back with your reason");
          void qc.invalidateQueries({ queryKey: ["approvals"] });
        }}
      >
        {mode === "approve" ? (
          <label className="flex gap-3 items-start text-sm">
            <input type="checkbox" className="w-5 h-5 mt-0.5 accent-[var(--ink-900)]" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
            <span>I've checked the deadline ({formatDay(p.deadline)}) and stage ({p.stage}). Verified projects count fully in fair allocation.</span>
          </label>
        ) : (
          <label htmlFor={reasonId} className="label">
            Reason for the student (required)
            <textarea id={reasonId} className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={500} />
          </label>
        )}
      </PinDialog>
    </article>
  );
}
