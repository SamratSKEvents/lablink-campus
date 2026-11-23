/** Student home: one Feasibility Passport card per project. Staff see their department's projects. */
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDay } from "@shared/time";
import { api } from "../../lib/api";
import { useSession } from "../../lib/auth";
import type { ProjectRow } from "../../lib/types";
import { Chip, Empty, ErrorNote, Loading, PageHeader, RISK, Segments, TASK_STATE } from "../../components/ui";
import { Squiggle } from "../../components/Doodles";

export default function ProjectsHome() {
  const { user } = useSession();
  const { data, isLoading, error } = useQuery({ queryKey: ["projects"], queryFn: () => api<{ projects: ProjectRow[] }>("/projects") });
  const student = user?.role === "student";
  return (
    <>
      <PageHeader
        title={student ? <>My <Squiggle>projects</Squiggle></> : "Projects"}
        note={student ? "↘ what's stopping you right now?" : undefined}
        doodles="flask"
        lead={student ? "One card per project. Green means booked, blue means planned, red means something needs you." : "Every project in your department, most urgent first."}
        action={
          student && (
            <Link to="/projects/new" className="btn btn-yellow">
              <Plus size={18} aria-hidden="true" /> Plan a new project
            </Link>
          )
        }
      />
      <ErrorNote error={error} />
      {isLoading && <Loading label="Loading projects" />}
      {data && data.projects.length === 0 && (
        <Empty title="No projects yet">{student ? "Describe what you're building and LabLink plans the lab time for you." : "Nothing to review yet."}</Empty>
      )}
      <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 stagger">
        {data?.projects.map((p) => {
          const risk = RISK[p.risk]!;
          const booked = p.taskStates.filter((s) => s === "booked" || s === "done").length;
          return (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="card card-lift block h-full">
                <div className="flex justify-between items-start gap-3">
                  <h2 className="!text-xl">
                    {p.title} <span aria-hidden="true">{p.emoji}</span>
                  </h2>
                  <Chip tone={risk.tone}>{risk.label}</Chip>
                </div>
                <Segments colors={p.taskStates.map((s) => TASK_STATE[s]!.bar)} label={`${booked} of ${p.tasks.length} steps booked`} />
                <p className="meta">{p.riskReason}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Chip tone="neutral" dot={false}>Due {formatDay(p.deadline)}</Chip>
                  {!student && <Chip tone="neutral" dot={false}>{p.owner}</Chip>}
                  {p.approval === "pending" && <Chip tone="yellow">Awaiting approval</Chip>}
                  {p.verifiedBy && <Chip tone="violet">Faculty-verified</Chip>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
