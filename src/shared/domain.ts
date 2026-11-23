/**
 * LabLink domain model, shared by the server, the web app, the engine and the tests.
 * All instants are ISO-8601 UTC strings. They are displayed in Asia/Kolkata (see time.ts).
 */
import { z } from "zod";

export const ROLES = ["student", "faculty", "technician", "admin", "security"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: readonly Role[] = ["faculty", "technician", "admin"];

export const HAZARD_LEVELS = ["none", "low", "medium", "high"] as const;
export type HazardLevel = (typeof HAZARD_LEVELS)[number];

export const STAGES = ["idea", "prototype", "testing", "final"] as const;
export type Stage = (typeof STAGES)[number];

export const EQUIPMENT_STATUSES = ["available", "maintenance", "calibration", "out_of_service"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const BOOKING_STATUSES = [
  "held",
  "confirmed",
  "checked_in",
  "completed",
  "no_show",
  "released",
  "cancelled",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy a seat (subject to lazy expiry, see bookings/slotLocks.ts). */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ["held", "confirmed", "checked_in"];

export interface EquipmentClass {
  id: string;
  label: string;
  hazard: HazardLevel;
  icon: string;
}

export interface Equipment {
  id: string;
  name: string;
  model: string;
  classId: string;
  labId: string;
  departmentId: string;
  bench: string;
  status: EquipmentStatus;
  capacity: number;
  requiresCert: boolean;
  requiresSupervision: boolean;
  accessible: boolean;
  specs: Record<string, number>;
  maintenanceWindows: { start: string; end: string }[];
  manualExtract?: string;
}

export interface Lab {
  id: string;
  name: string;
  departmentId: string;
  building: string;
  /** Opening hours as minutes after midnight, Asia/Kolkata. */
  openMin: number;
  closeMin: number;
  /** Hours when a technician is on shift (minutes after midnight, IST). */
  staffedFromMin: number;
  staffedToMin: number;
  /** Position on the campus map (twin and SVG fallback), in abstract units. */
  map: { x: number; z: number };
  exits: string[];
  extinguisher: string;
  eyewash: string;
}

export interface Department {
  id: string;
  name: string;
  approvalChain: Role[];
}

export interface Certification {
  classId: string;
  level: "full" | "supervised";
  expiresAt: string;
  grantedBy: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  departmentId: string;
  certifications: Certification[];
  tutorials: string[];
  recentUsageHours: number;
  noShowCount: number;
  demo: boolean;
  accessibility?: { needsAccessibleBench?: boolean };
}

export interface Task {
  id: string;
  name: string;
  classId: string;
  durationMin: number;
  dependsOn: string[];
  /** Alternative equipment classes that can do this task (lower fit). */
  alternatives?: string[];
}

export interface Project {
  id: string;
  ownerId: string;
  team: string[];
  title: string;
  emoji: string;
  description: string;
  category: string;
  stage: Stage;
  deadline: string;
  /** Faculty verification of deadline and stage (stops gaming the fairness score). */
  verifiedBy: string | null;
  tasks: Task[];
  parts: PlanPart[];
  status: "draft" | "planned" | "requested" | "approved" | "active" | "done";
  createdAt: string;
  /** When the project first asked for equipment; used by the waiting-time factor. */
  requestedAt?: string;
  supervisedPriority?: boolean;
}

export interface PlanPart {
  name: string;
  shape: XrayShape;
  quantity?: { kind: "fluid" | "heat" | "pressure" | "current"; label: string };
  taskId?: string;
}

export const XRAY_SHAPES = ["board", "sensor", "pipe", "motor", "casing", "battery", "display"] as const;
export type XrayShape = (typeof XRAY_SHAPES)[number];

export interface Booking {
  id: string;
  projectId: string;
  taskId: string;
  equipmentId: string;
  userId: string;
  start: string;
  end: string;
  seat: number;
  status: BookingStatus;
  /** Set for holds: after this instant a held booking no longer occupies its seat. */
  expiresAt?: string;
  checkedInAt?: string;
  decisionId?: string;
  buddyId?: string;
}

export interface ScoreBreakdown {
  deadline: number;
  stage: number;
  usage: number;
  wait: number;
  fit: number;
  unblocks: number;
  noShowPenalty: number;
  total: number;
}

export interface DecisionCandidate {
  userId: string;
  projectId: string;
  eligible: boolean;
  filteredBy?: string;
  scores?: ScoreBreakdown;
}

export interface Alternative {
  kind: "shared" | "same_model_other_lab" | "equivalent" | "later_slot";
  equipmentId: string;
  start: string;
  end: string;
  note: string;
}

export interface Decision {
  id: string;
  equipmentId: string;
  start: string;
  end: string;
  candidates: DecisionCandidate[];
  winnerUserId: string | null;
  alternatives: Record<string, Alternative[]>;
  policyVersion: string;
  explanation: string;
  explanationSource: "ai" | "template";
  createdAt: string;
  override?: { by: string; reason: string; winnerUserId: string };
}

export interface Incident {
  id: string;
  type: SosType | "fault" | "welfare_check";
  userId: string;
  labId: string;
  bench?: string;
  equipmentId?: string;
  at: string;
  status: "active" | "resolved";
  log: { at: string; text: string }[];
  reportDraft?: string;
  demo: boolean;
}

export const SOS_TYPES = ["fire", "chemical", "electrical", "injury", "gas_leak", "malfunction", "unspecified"] as const;
export type SosType = (typeof SOS_TYPES)[number];

/* ------------------------------------------------------------------ */
/* API input schemas (validated on the server and reused by forms).    */
/* ------------------------------------------------------------------ */

const isoDate = z.iso.datetime({ offset: true });

export const cardLoginSchema = z.object({ token: z.string().min(10).max(300) });
export const pinSchema = z.object({ pin: z.string().regex(/^\d{4}$/, "PIN is 4 digits") });

export const describeProjectSchema = z.object({
  description: z.string().trim().min(10, "Tell us a bit more (10+ characters)").max(1200),
  deadline: isoDate,
  stage: z.enum(STAGES),
  team: z.array(z.string().max(64)).max(6).default([]),
});

export const taskSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  classId: z.string().min(1).max(40),
  durationMin: z.number().int().min(15).max(480),
  dependsOn: z.array(z.string().max(40)).max(10),
  alternatives: z.array(z.string().max(40)).max(4).optional(),
});

export const partSchema = z.object({
  name: z.string().min(1).max(60),
  shape: z.enum(XRAY_SHAPES),
  quantity: z
    .object({ kind: z.enum(["fluid", "heat", "pressure", "current"]), label: z.string().max(40) })
    .optional(),
  taskId: z.string().max(40).optional(),
});

export const confirmPlanSchema = z.object({
  title: z.string().trim().min(2).max(80),
  emoji: z.string().max(8).default("🧪"),
  description: z.string().max(1200),
  category: z.string().max(40),
  stage: z.enum(STAGES),
  deadline: isoDate,
  team: z.array(z.string().max(64)).max(6).default([]),
  tasks: z.array(taskSchema).min(1).max(12),
  parts: z.array(partSchema).max(16).default([]),
});

export const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(500).optional(),
  verifyDeadlineAndStage: z.boolean().default(false),
  pin: z.string().regex(/^\d{4}$/),
});

export const holdSchema = z.object({ idempotencyKey: z.string().uuid() });
export const sosSchema = z.object({
  type: z.enum(SOS_TYPES),
  labId: z.string().max(40),
  bench: z.string().max(20).optional(),
  equipmentId: z.string().max(40).optional(),
});
export const faultSchema = z.object({ equipmentId: z.string().max(40), note: z.string().max(400) });
export const nearMissSchema = z.object({
  labId: z.string().max(40),
  equipmentId: z.string().max(40).optional(),
  description: z.string().trim().min(5).max(500),
});
export const evacuationSchema = z.object({
  needs: z.array(z.enum(["wheelchair", "deaf_hoh", "blind_low_vision", "other"])).min(1),
  instructions: z.string().trim().max(300),
});
export const certifySchema = z.object({
  userId: z.string().max(64),
  classId: z.string().max(40),
  level: z.enum(["full", "supervised"]),
  pin: z.string().regex(/^\d{4}$/),
});
export const overrideSchema = z.object({
  winnerUserId: z.string().max(64),
  reason: z.string().trim().min(10, "Overrides need a real reason").max(500),
  pin: z.string().regex(/^\d{4}$/),
});
export const searchSchema = z.object({ q: z.string().trim().max(200).default("") });
