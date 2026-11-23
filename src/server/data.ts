/**
 * Typed Firestore access and the engine snapshot loader.
 * All writes go through the API (client writes are denied by firestore.rules).
 */
import type { DocumentData, Query } from "firebase-admin/firestore";
import type {
  Booking,
  Decision,
  Department,
  Equipment,
  Incident,
  Lab,
  Project,
  User,
} from "../shared/domain.js";
import type { EngineContext } from "./allocation/context.js";
import { db } from "./firebase.js";
import { notFound } from "./middleware/errors.js";

export interface StoredUser extends User {
  pinHash?: string;
  pinFailures: number;
  pinLockedUntil: string | null;
}

export interface Card {
  id: string;
  userId: string;
  cardVersion: number;
  status: "active" | "revoked";
}

export interface AccessRequest {
  id: string;
  projectId: string;
  ownerId: string;
  departmentId: string;
  classIds: string[];
  status: "pending" | "approved" | "rejected";
  approvals: { approverId: string; decision: "approve" | "reject"; reason?: string; at: string }[];
  safetyLevel: string;
  reviewRequired: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  text: string;
  kind: "info" | "success" | "warning" | "alert";
  at: string;
  read: boolean;
  link?: string;
}

export const C = {
  users: "users",
  cards: "cards",
  departments: "departments",
  labs: "labs",
  equipment: "equipment",
  equivalences: "equivalences",
  projects: "projects",
  requests: "requests",
  bookings: "bookings",
  slotLocks: "slotLocks",
  idempotency: "idempotency",
  decisions: "decisions",
  incidents: "incidents",
  notifications: "notifications",
  hazardChecks: "hazardChecks",
  wellnessChecks: "wellnessChecks",
  evacuationPlans: "evacuationPlans",
  nearMisses: "nearMisses",
  usageEvents: "usageEvents",
  waitlist: "waitlist",
} as const;

export const col = (name: (typeof C)[keyof typeof C]) => db().collection(name);

export async function get<T>(name: (typeof C)[keyof typeof C], id: string): Promise<T | null> {
  const snap = await col(name).doc(id).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
}

export async function mustGet<T>(name: (typeof C)[keyof typeof C], id: string, what = "That item"): Promise<T> {
  const v = await get<T>(name, id);
  if (!v) throw notFound(`${what} wasn't found.`);
  return v;
}

export async function all<T>(q: Query<DocumentData> | (typeof C)[keyof typeof C]): Promise<T[]> {
  const snap = await (typeof q === "string" ? col(q) : q).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

/** Strip server-only fields before sending a user to any client. */
export function publicUser(u: StoredUser): User {
  const { pinHash: _p, pinFailures: _f, pinLockedUntil: _l, ...rest } = u;
  return rest;
}

export async function notify(userIds: string[], text: string, kind: Notification["kind"] = "info", link?: string) {
  const batch = db().batch();
  const at = new Date().toISOString();
  for (const userId of new Set(userIds)) batch.set(col(C.notifications).doc(), { userId, text, kind, at, read: false, link: link ?? null });
  await batch.commit();
}

/**
 * Snapshot for the engine. ponytail: loads every unit, user and current booking:
 * fine for one campus (~100 units, ~1k bookings/week). Add per-class/date queries past that.
 */
export async function loadContext(now = new Date()): Promise<EngineContext> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [equipment, labs, users, bookings, eqv] = await Promise.all([
    all<Equipment>(C.equipment),
    all<Lab>(C.labs),
    all<StoredUser>(C.users),
    all<Booking>(col(C.bookings).where("end", ">=", since)),
    all<{ a: string; b: string }>(C.equivalences),
  ]);
  return {
    now,
    equipment,
    labs,
    bookings,
    users: Object.fromEntries(users.map((u) => [u.id, publicUser(u)])),
    equivalences: eqv.map((e) => [e.a, e.b] as [string, string]),
  };
}

export type { Booking, Decision, Department, Equipment, Incident, Lab, Project, User };
