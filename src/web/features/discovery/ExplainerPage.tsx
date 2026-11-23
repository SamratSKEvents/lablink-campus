/**
 * Instrument explainer: Gemini's steps (grounded in the manual) highlight controls on a
 * 3D model. Finishing marks "Tutorial completed" only. It never certifies.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { useParams } from "react-router-dom";
import { post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import { AiNote, Chip, ErrorNote, Loading, PageHeader, Skeleton } from "../../components/ui";
import { ViewToggle, useViewMode } from "../../three/ViewToggle";

const InstrumentModel = lazy(() => import("../../three/Explainer"));

interface ExplainResponse {
  steps: { text: string; control: string }[];
  source: string;
  controls: { id: string; label: string }[];
  classId: string;
  name: string;
  model: string;
}

export default function ExplainerPage() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const [goal, setGoal] = useState("");
  const [asked, setAsked] = useState("Get started");
  const [step, setStep] = useState(0);
  const [mode, setMode] = useViewMode();
  const goalId = useId();
  const q = useQuery({ queryKey: ["explain", id, asked], queryFn: () => post<ExplainResponse>(`/equipment/${id}/explain`, { goal: asked }) });
  const done = useMutation({ mutationFn: () => post(`/tutorials/${q.data!.classId}`) });

  if (q.isLoading) return <Loading label="Preparing the walkthrough" />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const d = q.data;
  const current = d.steps[Math.min(step, d.steps.length - 1)]!;
  const label = d.controls.find((c) => c.id === current.control)?.label ?? current.control;

  return (
    <>
      <PageHeader title={`How to use: ${d.name}`} lead={`${d.model}. Steps are grounded in the lab's manual extract.`} action={<ViewToggle mode={mode} onChange={setMode} />} />
      <form
        className="flex gap-2 mb-6"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(goal.trim() || "Get started");
          setStep(0);
        }}
      >
        <label htmlFor={goalId} className="sr-only">What do you want to do?</label>
        <input id={goalId} className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What do you want to do? e.g. measure a PWM signal" maxLength={200} />
        <button className="btn btn-ai shrink-0">✦ Ask</button>
      </form>
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <section className="card !p-0 overflow-hidden min-h-80" aria-label={`3D model of ${d.name}. Highlighted: ${label}`}>
          {mode === "3d" ? (
            <Suspense fallback={<Skeleton className="h-96 !rounded-none" />}>
              <InstrumentModel classId={d.classId} highlight={current.control} />
            </Suspense>
          ) : (
            <ul className="p-6 grid gap-2">
              {d.controls.map((c) => (
                <li key={c.id} className={`task-row ${c.id === current.control ? "!bg-yellow-tint font-semibold" : ""}`} aria-current={c.id === current.control ? "step" : undefined}>
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card grid gap-4 content-start" aria-labelledby="steps">
          <div className="flex items-center justify-between">
            <h2 id="steps" className="!text-xl">Step {step + 1} of {d.steps.length}</h2>
            <Chip tone="yellow">{label}</Chip>
          </div>
          <p className="text-lg" aria-live="polite">{current.text}</p>
          <div className="flex gap-2">
            <button className="btn btn-soft" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous step"><ChevronLeft size={18} aria-hidden="true" /></button>
            {step < d.steps.length - 1 ? (
              <button className="btn btn-primary flex-1" onClick={() => setStep((s) => s + 1)}>Next <ChevronRight size={18} aria-hidden="true" /></button>
            ) : user?.role === "student" ? (
              <button className="btn btn-primary flex-1" onClick={() => done.mutate()} disabled={done.isPending || done.isSuccess}>{done.isSuccess ? "Tutorial completed ✓" : "Mark tutorial completed"}</button>
            ) : null}
          </div>
          <ErrorNote error={done.error} />
          <AiNote source={d.source}>These steps help you get started. They are not safety training.</AiNote>
          <p className="meta">Completing a tutorial doesn't certify you. A technician certifies you after hands-on training.</p>
        </section>
      </div>
    </>
  );
}
