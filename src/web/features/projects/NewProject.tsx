/**
 * Describe → Plan. The student describes the project (typed or by voice); Gemini drafts
 * ordered tasks, parts and physical quantities; Guardian adds hazards; the student edits
 * and confirms. Nothing is saved until they confirm.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, MicOff, Trash2 } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { classLabel, EQUIPMENT_CLASSES } from "@shared/catalogue";
import { STAGES, type Stage } from "@shared/domain";
import { post } from "../../lib/api";
import type { AiPlan, Project, Safety } from "../../lib/types";
import { AiNote, Chip, ErrorNote, FlaskLoader, PageHeader, Skeleton, Spinner } from "../../components/ui";
import { Squiggle } from "../../components/Doodles";
import { SafetyCard } from "./SafetyCard";

const Xray = lazy(() => import("../../three/Xray"));

interface PlanResponse {
  plan: AiPlan;
  source: string;
  xray: { supported: boolean; ratio: number };
  safety: Safety;
  safetySource: string;
}

const STAGE_LABEL: Record<Stage, string> = { idea: "Idea", prototype: "Prototype", testing: "Testing", final: "Final build" };

export default function NewProject() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [stage, setStage] = useState<Stage>("prototype");
  const [draft, setDraft] = useState<PlanResponse | null>(null);
  const ids = { desc: useId(), deadline: useId(), stage: useId() };

  const deadlineIso = () => new Date(`${deadline}T17:00:00+05:30`).toISOString();
  const plan = useMutation({
    mutationFn: () => post<PlanResponse>("/projects/plan", { description, deadline: deadlineIso(), stage }),
    onSuccess: setDraft,
  });
  const confirm = useMutation({
    mutationFn: () => post<{ project: Project }>("/projects", { ...draft!.plan, description, stage, deadline: deadlineIso() }),
    onSuccess: ({ project }) => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${project.id}`);
    },
  });

  const updateTask = (i: number, patch: Partial<AiPlan["tasks"][number]>) =>
    setDraft((d) => d && { ...d, plan: { ...d.plan, tasks: d.plan.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) } });
  const removeTask = (i: number) =>
    setDraft((d) => {
      if (!d) return d;
      const gone = d.plan.tasks[i]!.id;
      return { ...d, plan: { ...d.plan, tasks: d.plan.tasks.filter((_, j) => j !== i).map((t) => ({ ...t, dependsOn: t.dependsOn.filter((x) => x !== gone) })) } };
    });

  return (
    <>
      <PageHeader title={<>What are you <Squiggle>building</Squiggle>?</>} note="↘ plain words are fine" lead="Describe it in your own words. Gemini drafts the plan, and you confirm it." doodles="beaker" />
      <form
        className="card grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          plan.mutate();
        }}
      >
        <label className="label" htmlFor={ids.desc}>
          Your project
          <div className="relative">
            <textarea
              id={ids.desc}
              className="input min-h-32 pr-14 resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A soil-moisture sensor that waters plants automatically, with a small pump and a printed case…"
              required
              minLength={10}
              maxLength={1200}
            />
            <VoiceInput onText={(t) => setDescription((d) => (d ? `${d} ${t}` : t))} />
          </div>
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="label" htmlFor={ids.deadline}>
            Deadline (demo or submission day)
            <input id={ids.deadline} type="date" className="input" value={deadline} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDeadline(e.target.value)} required />
          </label>
          <label className="label" htmlFor={ids.stage}>
            Stage
            <select id={ids.stage} className="input" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ErrorNote error={plan.error} />
        <button className="btn btn-yellow justify-self-start" disabled={plan.isPending || description.trim().length < 10}>
          {plan.isPending ? <><Spinner /> Planning…</> : "✦ Plan it"}
        </button>
        <p className="hand -mt-2" aria-hidden="true">↑ faculty verify your deadline and stage later, so be honest</p>
      </form>

      {plan.isPending && <FlaskLoader label="Gemini is drafting your plan" />}

      {draft && !plan.isPending && (
        <section className="grid gap-6 mt-10 enter" aria-labelledby="plan-title">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="plan-title">
              {draft.plan.title} <span aria-hidden="true">{draft.plan.emoji}</span>
            </h2>
            <Chip tone={draft.plan.confidence === "high" ? "green" : draft.plan.confidence === "medium" ? "yellow" : "orange"}>{draft.plan.confidence} confidence</Chip>
          </div>
          <AiNote source={draft.source}>
            {draft.plan.declineReason ? `I'm not sure about this one: ${draft.plan.declineReason} Please check the plan with your faculty.` : `Drafted ${draft.plan.tasks.length} lab steps from your description. Edit anything that looks wrong.`}
          </AiNote>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="grid gap-3">
              <h3>Lab steps, in order</h3>
              <ol className="grid gap-2">
                {draft.plan.tasks.map((t, i) => (
                  <li key={t.id} className="task-row flex-wrap">
                    <span className="mono w-6 text-ink-2" aria-hidden="true">{i + 1}</span>
                    <div className="flex-1 min-w-48 grid gap-1">
                      <input aria-label={`Step ${i + 1} name`} className="input !min-h-10 !py-2 !bg-white font-semibold" value={t.name} onChange={(e) => updateTask(i, { name: e.target.value })} />
                      <div className="flex flex-wrap gap-2 items-center">
                        <select aria-label={`Step ${i + 1} equipment`} className="input !min-h-10 !py-2 !bg-white !w-auto text-sm" value={t.classId} onChange={(e) => updateTask(i, { classId: e.target.value })}>
                          {EQUIPMENT_CLASSES.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                          ))}
                        </select>
                        <label className="meta inline-flex items-center gap-1">
                          <input type="number" min={15} max={240} step={15} className="input !min-h-10 !py-2 !bg-white !w-20" value={t.durationMin} onChange={(e) => updateTask(i, { durationMin: Number(e.target.value) })} aria-label={`Step ${i + 1} minutes`} />
                          min
                        </label>
                        {t.dependsOn.length > 0 && <span className="meta">after {t.dependsOn.map((d) => draft.plan.tasks.find((x) => x.id === d)?.name ?? d).join(", ")}</span>}
                      </div>
                    </div>
                    <button type="button" className="btn btn-soft !p-0 !w-11 !h-11 !bg-white" onClick={() => removeTask(i)} aria-label={`Remove step ${i + 1}`} disabled={draft.plan.tasks.length === 1}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className="grid gap-3 content-start lg:border-l lg:border-line lg:pl-6">
              <h3>Project X-Ray</h3>
              {draft.xray.supported ? (
                <Suspense fallback={<Skeleton className="h-72" />}>
                  <Xray parts={draft.plan.parts} tasks={draft.plan.tasks.map((t) => ({ id: t.id, name: t.name, equipment: classLabel(t.classId) }))} />
                </Suspense>
              ) : (
                <PartsList parts={draft.plan.parts} note="3D preview isn't available for this project type. Here are the parts instead." />
              )}
            </div>
          </div>

          <SafetyCard safety={draft.safety} source={draft.safetySource} />

          <ErrorNote error={confirm.error} />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
              {confirm.isPending ? <><Spinner /> Saving…</> : "Confirm this plan"}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => plan.mutate()} disabled={plan.isPending}>
              Re-plan
            </button>
          </div>
        </section>
      )}
    </>
  );
}

export function PartsList({ parts, note }: { parts: AiPlan["parts"]; note?: string }) {
  return (
    <div className="grid gap-2">
      {note && <p className="meta">{note}</p>}
      <ul className="grid gap-2">
        {parts.map((p) => (
          <li key={p.name} className="task-row">
            <span className="font-semibold flex-1">{p.name}</span>
            {p.quantity && <Chip tone={p.quantity.kind === "heat" ? "orange" : p.quantity.kind === "fluid" ? "blue" : p.quantity.kind === "pressure" ? "violet" : "yellow"}>{p.quantity.label}</Chip>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Voice input via the Web Speech API (where supported). */
function VoiceInput({ onText }: { onText: (t: string) => void }) {
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  const [listening, setListening] = useState(false);
  if (!Rec) return null;
  const start = () => {
    const r = new Rec();
    r.lang = "en-IN";
    r.interimResults = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0]!.transcript).join(" "));
    r.onend = () => setListening(false);
    r.start();
    setListening(true);
  };
  return (
    <button type="button" className={`btn ${listening ? "btn-danger" : "btn-soft"} !p-0 !w-11 !h-11 absolute right-2 top-2`} onClick={start} aria-label={listening ? "Listening…" : "Describe by voice"} aria-pressed={listening}>
      {listening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
    </button>
  );
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  start: () => void;
}
