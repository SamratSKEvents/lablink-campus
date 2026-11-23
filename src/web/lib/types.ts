/** Response shapes used by the web app (mirrors the server routes). */
import type { Booking, Decision, Equipment, Lab, PlanPart, Project, Task, User } from "@shared/domain";

export type TaskState = "booked" | "held" | "planned" | "unresolved" | "done";
export type Risk = "on_track" | "at_risk" | "infeasible";
export type LiveStatus = "free" | "held" | "booked" | "maintenance" | "sos";

export interface Placement {
  taskId: string;
  equipmentId: string;
  start: string;
  end: string;
  seat: number;
  fit: "exact" | "equivalent" | "alternative";
}

export interface Safety {
  level: "none" | "low" | "medium" | "high";
  hazards: string[];
  precautions: string[];
  ppe: string[];
  reviewRequired: boolean;
  acknowledged?: boolean;
}

export interface Passport {
  risk: Risk;
  riskReason: string;
  tasks: (Pick<Task, "id" | "name" | "classId" | "durationMin" | "dependsOn"> & {
    classLabel: string;
    state: TaskState;
    booking?: Pick<Booking, "id" | "equipmentId" | "start" | "end" | "status" | "expiresAt">;
    proposal?: Placement;
    blocker?: string;
  })[];
  prerequisites: { classId: string; classLabel: string; met: boolean; level?: string }[];
  approval: { status: "pending" | "approved" | "rejected" | "not_requested"; pendingWith?: string };
  safety: Safety;
  preview: { status: "feasible" | "partial" | "infeasible"; placements: Placement[]; unresolved: { taskId: string; reason: string }[]; finish: string | null };
}

export interface ProjectRow extends Project {
  owner: string;
  risk: Risk;
  riskReason: string;
  taskStates: TaskState[];
  approval: Passport["approval"]["status"];
}

export interface EquipmentItem extends Equipment {
  classLabel: string;
  lab: string;
  liveStatus: LiveStatus;
  nextFree: string | null;
}

export interface AiPlan {
  title: string;
  emoji: string;
  category: string;
  confidence: "high" | "medium" | "low";
  declineReason?: string;
  tasks: Task[];
  parts: PlanPart[];
}

export interface LabWithUnits extends Lab {
  equipment: { id: string; name: string; classId: string; classLabel: string; bench: string; liveStatus: LiveStatus }[];
}

export type { Booking, Decision, Equipment, Lab, PlanPart, Project, Task, User };
