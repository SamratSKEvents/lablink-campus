/**
 * Seeded demo institution, with dates relative to seeding time.
 * 6 departments, 12 labs, ~60 units, 20 students, 6 faculty, 3 technicians, 1 admin,
 * 1 security officer; projects at every stage; live conflicts; one unit in maintenance;
 * an idle cluster for Opportunity Radar; five Finals Week contenders.
 */
import type { Booking, Department, Equipment, Lab, Project, Role } from "../../shared/domain.js";
import { addMinutes } from "../../shared/time.js";
import type { Card, StoredUser } from "../data.js";
import { TEMPLATES } from "../ai/templates.js";

export const DEMO_PINS = { faculty: "2468", technician: "1357", admin: "9999", security: "1122" } as const;

export const DEMO_CARDS = [
  { cardId: "STU-DEMO-01", userId: "u-priya", role: "student", label: "Student", name: "Priya Sharma" },
  { cardId: "FAC-DEMO-01", userId: "u-rao", role: "faculty", label: "Faculty", name: "Dr. Anil Rao", pin: DEMO_PINS.faculty },
  { cardId: "TEC-DEMO-01", userId: "u-meera", role: "technician", label: "Technician", name: "Meera Iyer", pin: DEMO_PINS.technician },
  { cardId: "ADM-DEMO-01", userId: "u-admin", role: "admin", label: "Admin / HoD", name: "Prof. Kavya Nair", pin: DEMO_PINS.admin },
] as const;

const DEPTS: Department[] = [
  { id: "ece", name: "Electronics & Communication", approvalChain: ["faculty"] },
  { id: "mech", name: "Mechanical", approvalChain: ["faculty"] },
  { id: "cse", name: "Computer Science", approvalChain: ["faculty"] },
  { id: "chem", name: "Chemical", approvalChain: ["faculty"] },
  { id: "phys", name: "Physics", approvalChain: ["faculty"] },
  { id: "bio", name: "Biotechnology", approvalChain: ["faculty"] },
];

const lab = (id: string, name: string, departmentId: string, building: string, x: number, z: number, late = false): Lab => ({
  id,
  name,
  departmentId,
  building,
  openMin: 8 * 60,
  closeMin: late ? 22 * 60 : 20 * 60,
  staffedFromMin: 9 * 60,
  staffedToMin: 18 * 60,
  map: { x, z },
  exits: ["East door (ramp)", "West stairwell"],
  extinguisher: "CO₂ extinguisher beside the east door",
  eyewash: "Eyewash station at sink 2",
});

const LABS: Lab[] = [
  lab("lab-ece-1", "ECE Lab 1", "ece", "Block A", 0, 0, true),
  lab("lab-ece-2", "ECE Lab 2", "ece", "Block A", 1, 0),
  lab("lab-mech-1", "Fabrication Lab", "mech", "Block B", 2, 0, true),
  lab("lab-mech-2", "Machine Shop", "mech", "Block B", 3, 0),
  lab("lab-cse-1", "Embedded Systems Lab", "cse", "Block C", 0, 1),
  lab("lab-cse-2", "FPGA Lab", "cse", "Block C", 1, 1),
  lab("lab-chem-1", "Analytical Chemistry Lab", "chem", "Block D", 2, 1),
  lab("lab-chem-2", "Process Lab", "chem", "Block D", 3, 1),
  lab("lab-phys-1", "Optics Lab", "phys", "Block E", 0, 2),
  lab("lab-phys-2", "Electronics Teaching Lab", "phys", "Block E", 1, 2),
  lab("lab-bio-1", "Microbiology Lab", "bio", "Block F", 2, 2),
  lab("lab-bio-2", "Imaging Lab", "bio", "Block F", 3, 2),
];

const MANUALS: Record<string, string> = {
  oscilloscope:
    "Keysight DSOX1204G quick start: connect probe to CH1, press Default Setup, then Auto Scale. Adjust the vertical scale knob (V/div) and horizontal scale knob (s/div). Set trigger level with the Trigger knob. Use Measure for frequency and Vpp. Press Run/Stop to freeze.",
  "3d-printer":
    "Prusa MK4 quick start: load filament via the control knob menu, run the first-layer calibration, slice with PrusaSlicer, insert the USB drive, select the file with the control knob, and watch the first layer. Remove prints from the spring-steel sheet once cool.",
};

let n = 0;
const unit = (labId: string, classId: string, name: string, model: string, over: Partial<Equipment> = {}): Equipment => {
  const l = LABS.find((x) => x.id === labId)!;
  n++;
  return {
    id: `eq-${classId.split("-")[0]}-${n}`,
    name,
    model,
    classId,
    labId,
    departmentId: l.departmentId,
    bench: `B${(n % 8) + 1}`,
    status: "available",
    capacity: 1,
    requiresCert: ["laser-cutter", "cnc-mill", "fume-hood", "soldering-station"].includes(classId),
    requiresSupervision: ["cnc-mill", "fume-hood"].includes(classId),
    accessible: n % 3 !== 0,
    specs: {},
    maintenanceWindows: [],
    ...(MANUALS[classId] ? { manualExtract: MANUALS[classId] } : {}),
    ...over,
  };
};

function buildEquipment(): Equipment[] {
  n = 0;
  const eq: Equipment[] = [
    { ...unit("lab-ece-1", "oscilloscope", "Oscilloscope 1", "Keysight DSOX1204G", { specs: { bandwidthMHz: 70, channels: 4 } }), id: "eq-scope-1" },
    unit("lab-ece-1", "oscilloscope", "Oscilloscope 2", "Keysight DSOX1204G", { specs: { bandwidthMHz: 70, channels: 4 } }),
    unit("lab-ece-2", "oscilloscope", "Oscilloscope 3", "Rigol DS1104Z", { specs: { bandwidthMHz: 100, channels: 4 } }),
    unit("lab-phys-2", "oscilloscope", "Oscilloscope 4", "Keysight DSOX1204G", { specs: { bandwidthMHz: 70, channels: 4 } }),
    unit("lab-ece-1", "workstation", "Electronics bench 1", "Bench + DMM", { capacity: 2 }),
    unit("lab-ece-1", "workstation", "Electronics bench 2", "Bench + DMM", { capacity: 2 }),
    unit("lab-ece-2", "workstation", "Electronics bench 3", "Bench + DMM"),
    unit("lab-cse-1", "workstation", "Embedded bench 1", "Bench + DMM"),
    unit("lab-phys-2", "workstation", "Teaching bench 1", "Bench + DMM", { capacity: 3 }),
    unit("lab-ece-1", "soldering-station", "Soldering station 1", "Hakko FX-888D"),
    unit("lab-ece-1", "soldering-station", "Soldering station 2", "Hakko FX-888D"),
    unit("lab-ece-2", "soldering-station", "Soldering station 3", "Weller WE1010"),
    unit("lab-cse-1", "logic-analyzer", "Logic analyser 1", "Saleae Logic Pro 8", { specs: { channels: 8, sampleRateMSs: 500 } }),
    unit("lab-ece-2", "logic-analyzer", "Mixed-signal analyser", "Digilent Analog Discovery 3", { specs: { channels: 16, sampleRateMSs: 125 } }),
    unit("lab-ece-1", "power-supply", "Bench supply 1", "Rigol DP832"),
    unit("lab-ece-2", "power-supply", "Bench supply 2", "Rigol DP832"),
    unit("lab-mech-1", "3d-printer", "3D printer 1", "Prusa MK4", { specs: { buildVolumeL: 7 } }),
    unit("lab-mech-1", "3d-printer", "3D printer 2", "Prusa MK4", { specs: { buildVolumeL: 7 } }),
    unit("lab-mech-1", "3d-printer", "3D printer 3", "Bambu Lab X1C", { specs: { buildVolumeL: 17 } }),
    unit("lab-cse-1", "3d-printer", "3D printer 4", "Prusa MK4", { specs: { buildVolumeL: 7 } }),
    unit("lab-mech-1", "laser-cutter", "Laser cutter 1", "Epilog Fusion Edge 24"),
    unit("lab-mech-2", "laser-cutter", "Laser cutter 2", "Trotec Speedy 100"),
    unit("lab-mech-2", "cnc-mill", "CNC mill 1", "Haas Mini Mill"),
    unit("lab-mech-2", "cnc-mill", "CNC mill 2", "Tormach 440"),
    unit("lab-cse-2", "fpga-kit", "FPGA kit 1", "Digilent Basys 3"),
    unit("lab-cse-2", "fpga-kit", "FPGA kit 2", "Digilent Basys 3"),
    unit("lab-cse-2", "fpga-kit", "FPGA kit 3", "Terasic DE10-Lite"),
    unit("lab-cse-2", "workstation", "FPGA bench 1", "Bench + DMM"),
    unit("lab-chem-1", "spectrometer", "UV-Vis spectrometer 1", "Shimadzu UV-1900i"),
    unit("lab-chem-1", "spectrometer", "UV-Vis spectrometer 2", "Shimadzu UV-1900i"),
    unit("lab-chem-1", "fume-hood", "Fume hood 1", "Labconco Protector"),
    unit("lab-chem-2", "fume-hood", "Fume hood 2", "Labconco Protector"),
    unit("lab-chem-2", "fume-hood", "Fume hood 3", "Esco Frontier"),
    unit("lab-bio-1", "microscope", "Microscope 1", "Olympus CX23"),
    unit("lab-bio-1", "microscope", "Microscope 2", "Olympus CX23"),
    unit("lab-bio-2", "microscope", "Fluorescence microscope", "Zeiss Axio Lab.A1"),
    unit("lab-bio-2", "spectrometer", "Plate reader", "BioTek Synergy H1"),
    unit("lab-phys-1", "spectrometer", "Optical spectrometer", "Ocean Insight Flame"),
    unit("lab-phys-1", "power-supply", "HV supply", "Keithley 2400"),
    unit("lab-phys-1", "oscilloscope", "Optics scope", "Tektronix TBS2000B"),
    // Idle cluster for Opportunity Radar (Physics teaching kit nobody books).
    unit("lab-phys-2", "logic-analyzer", "Teaching logic analyser 1", "Digilent Analog Discovery 3", { specs: { channels: 16 } }),
    unit("lab-phys-2", "logic-analyzer", "Teaching logic analyser 2", "Digilent Analog Discovery 3", { specs: { channels: 16 } }),
    unit("lab-phys-2", "fpga-kit", "Teaching FPGA kit", "Digilent Basys 3"),
    unit("lab-phys-2", "soldering-station", "Teaching soldering station", "Hakko FX-888D"),
    unit("lab-bio-1", "workstation", "Bio bench 1", "Bench"),
    unit("lab-bio-2", "workstation", "Imaging bench", "Bench"),
    unit("lab-chem-2", "workstation", "Process bench", "Bench"),
    unit("lab-mech-1", "workstation", "Assembly bench 1", "Bench + tools", { capacity: 2 }),
    unit("lab-mech-1", "workstation", "Assembly bench 2", "Bench + tools", { capacity: 2 }),
    unit("lab-mech-2", "workstation", "Machine shop bench", "Bench + vice"),
    unit("lab-cse-1", "fpga-kit", "Embedded FPGA kit", "Digilent Arty A7"),
    unit("lab-cse-1", "power-supply", "Embedded bench supply", "Rigol DP711"),
    unit("lab-ece-2", "fpga-kit", "ECE FPGA kit", "Digilent Basys 3"),
    unit("lab-cse-1", "oscilloscope", "Embedded scope", "Rigol DS1054Z", { specs: { bandwidthMHz: 50, channels: 4 } }),
    unit("lab-mech-1", "soldering-station", "Fab-lab soldering", "Hakko FX-888D"),
    unit("lab-chem-1", "microscope", "Stereo microscope", "Leica S9i"),
    unit("lab-bio-1", "fume-hood", "Bio safety cabinet", "Esco Airstream"),
    unit("lab-cse-2", "logic-analyzer", "FPGA lab analyser", "Saleae Logic 8", { specs: { channels: 8 } }),
  ];
  // One unit under maintenance (live in the demo).
  const maint = eq.find((e) => e.name === "Oscilloscope 3")!;
  maint.status = "maintenance";
  return eq;
}

const SECURITY = "u-security";
const FIRST = ["Priya", "Arjun", "Kabir", "Ananya", "Rohan", "Isha", "Vikram", "Sneha", "Aditya", "Meghna", "Rahul", "Diya", "Karthik", "Neha", "Siddharth", "Pooja", "Aman", "Riya", "Varun", "Tanvi"];
const LAST = ["Sharma", "Mehta", "Singh", "Gupta", "Reddy", "Patel", "Kumar", "Joshi", "Nair", "Das", "Verma", "Pillai", "Rao", "Kapoor", "Bose", "Iyer", "Khan", "Menon", "Chopra", "Shah"];

export function buildDemo(now = new Date()) {
  const equipment = buildEquipment();
  const inYear = new Date(now.getTime() + 365 * 86_400_000).toISOString();
  const cert = (classId: string, level: "full" | "supervised" = "full") => ({ classId, level, expiresAt: inYear, grantedBy: "u-meera" });

  const users: StoredUser[] = [];
  const base = { tutorials: [], noShowCount: 0, demo: true, pinFailures: 0, pinLockedUntil: null, certifications: [] as StoredUser["certifications"], recentUsageHours: 0 };
  FIRST.forEach((f, i) => {
    const id = i === 0 ? "u-priya" : `u-s${i + 1}`;
    users.push({
      ...base,
      id,
      name: `${f} ${LAST[i]}`,
      role: "student",
      departmentId: ["ece", "mech", "cse", "ece", "chem", "ece", "phys", "bio", "ece", "cse", "mech", "ece", "cse", "bio", "chem", "ece", "phys", "mech", "cse", "ece"][i]!,
      recentUsageHours: [3, 14, 9, 0, 6, 18, 2, 4, 11, 7, 5, 1, 8, 0, 12, 3, 6, 2, 10, 4][i]!,
      noShowCount: i === 5 ? 2 : 0,
      certifications: i === 0 ? [cert("soldering-station"), cert("laser-cutter", "supervised")] : i % 2 ? [cert("soldering-station")] : [],
      ...(i === 3 ? { accessibility: { needsAccessibleBench: true } } : {}),
    });
  });
  const staff: [string, string, Role, string][] = [
    ["u-rao", "Dr. Anil Rao", "faculty", "ece"],
    ["u-f-mech", "Dr. Leela Menon", "faculty", "mech"],
    ["u-f-cse", "Dr. Farhan Ali", "faculty", "cse"],
    ["u-f-chem", "Dr. Sunita Bose", "faculty", "chem"],
    ["u-f-phys", "Dr. Ravi Shankar", "faculty", "phys"],
    ["u-f-bio", "Dr. Nandini Rao", "faculty", "bio"],
    ["u-meera", "Meera Iyer", "technician", "ece"],
    ["u-t-mech", "Joseph D'Souza", "technician", "mech"],
    ["u-t-chem", "Lakshmi Pillai", "technician", "chem"],
    ["u-admin", "Prof. Kavya Nair", "admin", "ece"],
    [SECURITY, "Campus Security", "security", "ece"],
  ];
  for (const [id, name, role, departmentId] of staff) users.push({ ...base, id, name, role, departmentId });

  const cards: Card[] = [
    ...DEMO_CARDS.map((c) => ({ id: c.cardId, userId: c.userId, cardVersion: 1, status: "active" as const })),
    ...users.filter((u) => !DEMO_CARDS.some((c) => c.userId === u.id)).map((u, i) => ({ id: `CARD-${String(i + 1).padStart(4, "0")}`, userId: u.id, cardVersion: 1, status: "active" as const })),
  ];

  const at = (days: number, istHour: number, min = 0) => {
    const d = new Date(now.getTime() + days * 86_400_000);
    const istMid = Math.floor((d.getTime() + 330 * 60_000) / 86_400_000) * 86_400_000 - 330 * 60_000;
    return new Date(istMid + (istHour * 60 + min) * 60_000).toISOString();
  };

  const tpl = (cat: string) => TEMPLATES.find((t) => t.category === cat)!;
  const proj = (id: string, ownerId: string, title: string, cat: string, stage: Project["stage"], deadlineDays: number, status: Project["status"], over: Partial<Project> = {}): Project => {
    const t = tpl(cat);
    return {
      id,
      ownerId,
      departmentId: users.find((u) => u.id === ownerId)!.departmentId,
      team: [],
      title,
      emoji: t.emoji,
      description: `${title}.`,
      category: cat,
      stage,
      deadline: at(deadlineDays, 17),
      verifiedBy: null,
      tasks: t.tasks,
      parts: t.parts,
      status,
      createdAt: at(-5, 10),
      ...over,
    };
  };

  const projects: Project[] = [
    proj("p-arm", "u-priya", "Robotic arm that sorts recyclables", "robotics", "prototype", 4, "approved", { description: "A 3-DOF robotic arm with servo motors and a camera that sorts recyclables, powered by a LiPo pack.", verifiedBy: "u-rao", requestedAt: at(-2, 11) }),
    proj("p-irrigate", "u-priya", "Smart drip irrigation", "fluid", "idea", 14, "planned"),
    proj("p-weather", "u-s4", "Campus weather station", "iot", "testing", 6, "requested", { requestedAt: at(-1, 15) }),
    proj("p-riscv", "u-s3", "RISC-V soft core on FPGA", "fpga", "testing", 3, "approved", { verifiedBy: "u-f-cse", requestedAt: at(-3, 9) }),
    proj("p-dye", "u-s5", "Natural dye absorbance study", "chemistry", "prototype", 9, "requested", { requestedAt: at(-1, 10) }),
    proj("p-rover", "u-s2", "Line-following rover", "robotics", "final", 2, "active", { verifiedBy: "u-f-mech", requestedAt: at(-4, 9) }),
  ];

  // Finals Week: five students each need the same oscilloscope for a final test.
  const finals: [string, string, Project["stage"], number, boolean, number][] = [
    ["u-s6", "ECG front-end filter", "final", 1, true, -1],
    ["u-s9", "Audio equaliser PCB", "testing", 3, true, -3],
    ["u-s12", "Ultrasonic range finder", "prototype", 6, false, -2],
    ["u-s16", "Wireless sensor node", "final", 2, false, -0.2],
    ["u-s20", "Motor speed controller", "testing", 2, true, -1.5],
  ];
  finals.forEach(([ownerId, title, stage, days, verified, requested], i) =>
    projects.push({
      ...proj(`p-finals-${i + 1}`, ownerId, title, "iot", stage, days, "approved"),
      category: "finals-week",
      emoji: "⏱️",
      tasks: [{ id: "scope", name: "Final signal test", classId: "oscilloscope", durationMin: 120, dependsOn: [] }],
      parts: [],
      verifiedBy: verified ? "u-rao" : null,
      requestedAt: new Date(now.getTime() + requested * 86_400_000).toISOString(),
    }),
  );

  const requests = projects
    .filter((p) => p.status !== "planned")
    .map((p) => ({
      id: `r-${p.id}`,
      projectId: p.id,
      ownerId: p.ownerId,
      departmentId: p.departmentId,
      classIds: [...new Set(p.tasks.map((t) => t.classId))],
      status: p.status === "requested" ? "pending" : "approved",
      approvals: p.status === "requested" ? [] : [{ approverId: "u-rao", decision: "approve", at: at(-1, 12) }],
      safetyLevel: p.id === "p-arm" ? "high" : "low",
      reviewRequired: p.id === "p-arm",
      createdAt: p.requestedAt ?? at(-2, 10),
    }));

  // Live bookings: other students occupying popular units (creates real conflicts),
  // plus completed past sessions so utilisation has data.
  const bookings: (Booking & { lockIds?: string[] })[] = [];
  const book = (id: string, userId: string, projectId: string, taskId: string, equipmentId: string, start: string, durMin: number, status: Booking["status"]) =>
    bookings.push({ id, userId, projectId, taskId, equipmentId, start, end: addMinutes(start, durMin).toISOString(), seat: 0, status, ...(status === "checked_in" || status === "completed" ? { checkedInAt: start } : {}) });
  book("b-rover-1", "u-s2", "p-rover", "fab", "eq-3d-17", at(0, 9), 180, "confirmed");
  book("b-rover-2", "u-s2", "p-rover", "asm", "eq-workstation-48", at(1, 9), 180, "confirmed");
  book("b-riscv-1", "u-s3", "p-riscv", "synth", "eq-fpga-25", at(0, 10), 120, "confirmed");
  book("b-busy-1", "u-s7", "p-weather", "proto", "eq-scope-1", at(1, 14), 120, "confirmed");
  book("b-busy-2", "u-s11", "p-weather", "proto", "eq-oscilloscope-2", at(1, 14), 120, "confirmed");
  for (let d = 1; d <= 6; d++) {
    book(`b-past-${d}a`, "u-s2", "p-rover", "fab", "eq-3d-17", at(-d, 10), 180, "completed");
    book(`b-past-${d}b`, "u-s7", "p-weather", "proto", "eq-scope-1", at(-d, 14), 120, "completed");
    book(`b-past-${d}c`, "u-s3", "p-riscv", "synth", "eq-fpga-25", at(-d, 11), 120, d % 3 === 0 ? "no_show" : "completed");
    book(`b-past-${d}d`, "u-s9", "p-finals-2", "scope", "eq-oscilloscope-2", at(-d, 9), 60, "completed");
  }
  const usageEvents = bookings
    .filter((b) => b.status === "completed" || b.status === "no_show")
    .map((b) => {
      const bookedMin = (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60_000;
      return { equipmentId: b.equipmentId, bookingId: b.id, bookedMin, actualMin: b.status === "no_show" ? 0 : Math.round(bookedMin * 0.85), at: b.end };
    });

  const equivalences = [
    { a: "eq-scope-1", b: "eq-oscilloscope-2", rule: "same model" },
    { a: "eq-scope-1", b: "eq-oscilloscope-4", rule: "same model" },
    { a: "eq-logic-13", b: "eq-logic-14", rule: "≥8 channels, ≥100 MS/s", verifiedBy: "u-meera" },
    { a: "eq-3d-17", b: "eq-3d-18", rule: "same model" },
  ];

  const nearMisses = [
    { labId: "lab-ece-1", equipmentId: "eq-soldering-10", description: "Fume extractor barely pulling air, smelled flux all session", at: at(-6, 12) },
    { labId: "lab-ece-1", equipmentId: "eq-soldering-10", description: "Smoke hung around the bench, extractor seemed weak", at: at(-3, 15) },
    { labId: "lab-ece-1", equipmentId: "eq-soldering-10", description: "Extractor filter looks clogged", at: at(-1, 11) },
    { labId: "lab-mech-1", equipmentId: "eq-3d-17", description: "Frayed USB cable on printer 1", at: at(-2, 10) },
  ];

  return { departments: DEPTS, labs: LABS, equipment, users, cards, projects, requests, bookings, usageEvents, equivalences, nearMisses, demoCards: DEMO_CARDS };
}
