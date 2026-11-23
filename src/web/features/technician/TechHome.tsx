/**
 * Technician: today in my labs. Units needing attention, live incidents, certification
 * sign-off (hands-on training, PIN-confirmed), and near-miss patterns to inspect.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { classLabel, EQUIPMENT_CLASSES } from "@shared/catalogue";
import { api, post } from "../../lib/api";
import { useSession } from "../../lib/auth";
import type { EquipmentItem, User } from "../../lib/types";
import { AiNote, Chip, ErrorNote, Loading, LIVE_STATUS, PageHeader, PinDialog, useToast } from "../../components/ui";

export default function TechHome() {
  const { user } = useSession();
  const eq = useQuery({ queryKey: ["equipment", ""], queryFn: () => api<{ items: EquipmentItem[] }>("/equipment?q=") });
  const incidents = useQuery({ queryKey: ["incidents"], queryFn: () => api<{ items: { status: string }[] }>("/incidents"), refetchInterval: 5_000 });
  const mine = (eq.data?.items ?? []).filter((e) => e.departmentId === user?.departmentId);
  const attention = mine.filter((e) => e.liveStatus === "maintenance" || e.liveStatus === "sos");
  const activeIncidents = incidents.data?.items.filter((i) => i.status === "active").length ?? 0;

  return (
    <>
      <PageHeader title="Today in my labs" lead="Units, alerts, certifications and safety patterns for your department." action={activeIncidents > 0 && <Link to="/incidents" className="btn btn-danger">{activeIncidents} active incident{activeIncidents > 1 ? "s" : ""}</Link>} />
      <ErrorNote error={eq.error} />
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card grid gap-3 content-start" aria-labelledby="units">
          <h2 id="units" className="!text-xl">Equipment ({mine.length})</h2>
          {eq.isLoading && <Loading />}
          {attention.length > 0 && <p className="meta">{attention.length} unit(s) need attention.</p>}
          <ul className="grid gap-1 max-h-[420px] overflow-auto">
            {[...attention, ...mine.filter((e) => !attention.includes(e))].map((e) => (
              <li key={e.id}>
                <Link to={`/equipment/${e.id}`} className="flex items-center justify-between gap-2 min-h-11 px-3 rounded-xl hover:bg-subtle">
                  <span className="text-sm">{e.name} <span className="meta">· {e.lab}</span></span>
                  <Chip tone={LIVE_STATUS[e.liveStatus]!.tone}>{LIVE_STATUS[e.liveStatus]!.label}</Chip>
                </Link>
              </li>
            ))}
          </ul>
          <p className="meta">Open a unit to change its status. Taking one out of service starts Rescue Mode for affected projects.</p>
        </section>
        <Certify />
        <NearMissPatterns />
      </div>
    </>
  );
}

function Certify() {
  const q = useQuery({ queryKey: ["students"], queryFn: () => api<{ students: Pick<User, "id" | "name" | "certifications" | "tutorials">[] }>("/students") });
  const [userId, setUserId] = useState("");
  const [classId, setClassId] = useState("soldering-station");
  const [level, setLevel] = useState<"full" | "supervised">("full");
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const student = q.data?.students.find((s) => s.id === userId);
  return (
    <section className="card grid gap-3 content-start" aria-labelledby="certify">
      <h2 id="certify" className="!text-xl">Certify after hands-on training</h2>
      <label className="label">
        Student
        <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Choose a student…</option>
          {q.data?.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {student && (
        <p className="meta">
          Certified: {student.certifications.map((c) => classLabel(c.classId)).join(", ") || "none"} · Tutorials: {student.tutorials.map(classLabel).join(", ") || "none"}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          Equipment
          <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {EQUIPMENT_CLASSES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="label">
          Level
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value as "full" | "supervised")}>
            <option value="full">Full</option>
            <option value="supervised">Supervised only</option>
          </select>
        </label>
      </div>
      <button className="btn btn-primary justify-self-start" disabled={!userId} onClick={() => setOpen(true)}>Grant certification</button>
      <PinDialog
        open={open}
        onOpenChange={setOpen}
        title="Grant certification"
        description={`${student?.name ?? ""}: ${classLabel(classId)} (${level}). Valid for one year.`}
        confirmLabel="Certify"
        onConfirm={async (pin) => {
          await post("/certifications", { userId, classId, level, pin });
          toast.success("Certified");
          void qc.invalidateQueries({ queryKey: ["students"] });
        }}
      />
    </section>
  );
}

function NearMissPatterns() {
  const q = useQuery({ queryKey: ["near-miss"], queryFn: () => api<{ clusters: { title: string; reportIds: string[]; action: string }[]; source: string; reports: { id: string; where: string; description: string }[] }>("/near-misses/clusters") });
  return (
    <section className="card grid gap-3 content-start lg:col-span-2" aria-labelledby="nm">
      <h2 id="nm" className="!text-xl">Near-miss patterns</h2>
      <ErrorNote error={q.error} />
      {q.data && q.data.clusters.length === 0 && <p className="meta">No patterns yet. {q.data.reports.length} anonymous report(s).</p>}
      {q.data?.clusters.map((c) => (
        <div key={c.title} className="task-row flex-wrap">
          <Chip tone="orange">{c.reportIds.length} reports</Chip>
          <div className="flex-1 min-w-48">
            <p className="font-semibold">{c.title}</p>
            <p className="meta">Inspection task: {c.action}</p>
          </div>
        </div>
      ))}
      {q.data && q.data.clusters.length > 0 && <AiNote source={q.data.source}>Patterns found across anonymous reports. Inspect before someone gets hurt.</AiNote>}
    </section>
  );
}
