import type { Booking, Equipment, Lab, Project, User } from "../src/shared/domain.js";
import type { EngineContext } from "../src/server/allocation/context.js";

/** Monday 23 Nov 2026, 09:00 IST. */
export const NOW = new Date("2026-11-23T03:30:00.000Z");
export const ist = (day: number, hh: number, mm = 0) =>
  new Date(Date.UTC(2026, 10, 23 + day, hh, mm) - 330 * 60_000);

export const lab = (over: Partial<Lab> = {}): Lab => ({
  id: "lab-ece",
  name: "ECE Lab 1",
  departmentId: "ece",
  building: "Block A",
  openMin: 9 * 60,
  closeMin: 20 * 60,
  staffedFromMin: 9 * 60,
  staffedToMin: 17 * 60,
  map: { x: 0, z: 0 },
  exits: ["East door"],
  extinguisher: "By the door",
  eyewash: "Sink 2",
  ...over,
});

export const unit = (over: Partial<Equipment> = {}): Equipment => ({
  id: "scope-1",
  name: "Oscilloscope 1",
  model: "Keysight DSOX1204G",
  classId: "oscilloscope",
  labId: "lab-ece",
  departmentId: "ece",
  bench: "B1",
  status: "available",
  capacity: 1,
  requiresCert: false,
  requiresSupervision: false,
  accessible: true,
  specs: { bandwidthMHz: 70 },
  maintenanceWindows: [],
  ...over,
});

export const user = (over: Partial<User> = {}): User => ({
  id: "u-priya",
  name: "Priya",
  role: "student",
  departmentId: "ece",
  certifications: [],
  tutorials: [],
  recentUsageHours: 0,
  noShowCount: 0,
  demo: true,
  ...over,
});

export const cert = (classId: string, level: "full" | "supervised" = "full") => ({
  classId,
  level,
  expiresAt: "2027-06-01T00:00:00.000Z",
  grantedBy: "u-tech",
});

export const project = (over: Partial<Project> = {}): Project => ({
  id: "p-arm",
  ownerId: "u-priya",
  team: [],
  title: "Robotic arm",
  emoji: "🦾",
  description: "A 3-DOF robotic arm",
  category: "robotics",
  stage: "prototype",
  deadline: ist(4, 17).toISOString(),
  verifiedBy: null,
  tasks: [
    { id: "fab", name: "Fabricate", classId: "3d-printer", durationMin: 120, dependsOn: [] },
    { id: "asm", name: "Assemble", classId: "workstation", durationMin: 180, dependsOn: ["fab"] },
    { id: "test", name: "Test", classId: "oscilloscope", durationMin: 60, dependsOn: ["asm"] },
  ],
  parts: [],
  status: "planned",
  createdAt: NOW.toISOString(),
  ...over,
});

export const booking = (over: Partial<Booking> = {}): Booking => ({
  id: "b1",
  projectId: "p-other",
  taskId: "t",
  equipmentId: "scope-1",
  userId: "u-other",
  start: ist(0, 10).toISOString(),
  end: ist(0, 12).toISOString(),
  seat: 0,
  status: "confirmed",
  checkedInAt: ist(0, 10).toISOString(),
  ...over,
});

export function ctx(over: Partial<EngineContext> = {}): EngineContext {
  const users = [user(), user({ id: "u-other", name: "Arjun" }), user({ id: "u-tech", name: "Tech", role: "technician" })];
  return {
    now: NOW,
    labs: [lab()],
    equipment: [
      unit(),
      unit({ id: "printer-1", name: "Printer 1", model: "Prusa MK4", classId: "3d-printer" }),
      unit({ id: "ws-1", name: "Workstation 1", model: "Bench", classId: "workstation" }),
    ],
    bookings: [],
    users: Object.fromEntries(users.map((u) => [u.id, u])),
    equivalences: [],
    ...over,
  };
}
