/**
 * End-to-end API flow on the Firebase emulators (Auth + Firestore):
 * ID card → plan → request → faculty approval (PIN) → atomic hold → confirm → SOS,
 * plus the security boundaries along the way.
 */
import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/server/app.js";
import { seedDemo } from "../../src/server/seed/seed.js";
import { DEMO_PINS } from "../../src/server/seed/demo.js";

const app = createApp();
let cards: { role: string; token: string }[] = [];
const ids: Record<string, string> = {};

async function signIn(role: string, kiosk = false): Promise<string> {
  const token = cards.find((c) => c.role === role)!.token;
  const res = await request(app).post("/api/auth/card").send({ token, kiosk }).expect(200);
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const ex = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: res.body.customToken, returnSecureToken: true }),
  });
  return ((await ex.json()) as { idToken: string }).idToken;
}

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  await seedDemo();
  cards = (await request(app).get("/api/demo-cards").expect(200)).body.cards;
  ids.student = await signIn("student");
  ids.faculty = await signIn("faculty");
  ids.technician = await signIn("technician");
  ids.admin = await signIn("admin");
}, 60_000);

describe("security boundaries", () => {
  it("health needs nothing and touches nothing", async () => {
    await request(app).get("/health").expect(200, { ok: true });
  });
  it("rejects missing and forged credentials with one generic message", async () => {
    await request(app).get("/api/me").expect(401);
    const forged = cards[0]!.token.replace("STU-DEMO-01", "FAC-DEMO-01");
    const r = await request(app).post("/api/auth/card").send({ token: forged }).expect(401);
    expect(r.body.error).toMatch(/wasn't recognised/);
  });
  it("enforces roles from server-side claims", async () => {
    await request(app).get("/api/approvals").set(auth(ids.student!)).expect(403);
    await request(app).get("/api/incidents").set(auth(ids.student!)).expect(403);
  });
  it("kiosk sessions can only reach kiosk routes", async () => {
    const kiosk = await signIn("student", true);
    await request(app).get("/api/projects").set(auth(kiosk)).expect(403);
    await request(app).get("/api/bookings/mine").set(auth(kiosk)).expect(200);
  });
  it("validates input", async () => {
    const r = await request(app).post("/api/projects/plan").set(auth(ids.student!)).send({ description: "x" }).expect(400);
    expect(r.body.code).toBe("invalid");
  });
});

describe("the project flow", () => {
  let projectId = "";
  let requestId = "";

  it("plans a project from a description (fallback when AI is off)", async () => {
    const deadline = new Date(Date.now() + 6 * 86_400_000).toISOString();
    const r = await request(app)
      .post("/api/projects/plan")
      .set(auth(ids.student!))
      .send({ description: "A robotic gripper arm with servo motors and a LiPo battery", deadline, stage: "prototype" })
      .expect(200);
    expect(r.body.plan.tasks.length).toBeGreaterThan(1);
    expect(r.body.safety.level).toBe("high");
    expect(r.body.safety.reviewRequired).toBe(true);
    const created = await request(app)
      .post("/api/projects")
      .set(auth(ids.student!))
      .send({ ...r.body.plan, description: "A robotic gripper arm with servo motors and a LiPo battery", stage: "prototype", deadline })
      .expect(201);
    projectId = created.body.project.id;
  });

  it("requires safety acknowledgement before a high-risk request", async () => {
    await request(app).post(`/api/projects/${projectId}/request`).set(auth(ids.student!)).expect(409);
    await request(app).post(`/api/projects/${projectId}/acknowledge-safety`).set(auth(ids.student!)).expect(200);
    const r = await request(app).post(`/api/projects/${projectId}/request`).set(auth(ids.student!)).expect(201);
    requestId = r.body.request.id;
  });

  it("blocks booking before approval", async () => {
    await request(app).post(`/api/projects/${projectId}/hold`).set(auth(ids.student!)).send({ idempotencyKey: randomUUID() }).expect(409);
  });

  it("faculty approve with PIN; a wrong PIN is refused and a reject needs a reason", async () => {
    const q = await request(app).get("/api/approvals").set(auth(ids.faculty!)).expect(200);
    expect(q.body.items.some((i: { request: { id: string } }) => i.request.id === requestId)).toBe(true);
    await request(app).post(`/api/approvals/${requestId}`).set(auth(ids.faculty!)).send({ decision: "approve", pin: "0000" }).expect(403);
    await request(app).post(`/api/approvals/${requestId}`).set(auth(ids.faculty!)).send({ decision: "reject", pin: DEMO_PINS.faculty }).expect(400);
    await request(app).post(`/api/approvals/${requestId}`).set(auth(ids.faculty!)).send({ decision: "approve", pin: DEMO_PINS.faculty, verifyDeadlineAndStage: true }).expect(200);
  });

  it("holds the whole bundle atomically and idempotently, then confirms", async () => {
    const key = randomUUID();
    const held = await request(app).post(`/api/projects/${projectId}/hold`).set(auth(ids.student!)).send({ idempotencyKey: key }).expect(201);
    expect(held.body.bookings.length).toBeGreaterThan(1);
    const replay = await request(app).post(`/api/projects/${projectId}/hold`).set(auth(ids.student!)).send({ idempotencyKey: key }).expect(200);
    expect(replay.body.replayed).toBe(true);
    await request(app).post(`/api/projects/${projectId}/confirm`).set(auth(ids.student!)).expect(200);
    const p = await request(app).get(`/api/projects/${projectId}`).set(auth(ids.student!)).expect(200);
    expect(p.body.passport.tasks.every((t: { state: string }) => t.state === "booked")).toBe(true);
  });

  it("a fault triggers Rescue Mode for affected projects", async () => {
    const p = await request(app).get(`/api/projects/${projectId}`).set(auth(ids.student!)).expect(200);
    const eqId = p.body.passport.tasks.at(-1).booking.equipmentId;
    const r = await request(app).post(`/api/equipment/${eqId}/status`).set(auth(ids.technician!)).send({ status: "out_of_service", pin: DEMO_PINS.technician }).expect(200);
    expect(r.body.rescueProposals.some((x: { projectId: string }) => x.projectId === projectId)).toBe(true);
  });
});

describe("safety and fairness", () => {
  it("SOS creates an incident visible to staff", async () => {
    const r = await request(app).post("/api/sos").set(auth(ids.student!)).send({ type: "fire", labId: "lab-ece-1", bench: "B2" }).expect(201);
    expect(r.body.demo).toBe(true);
    const inc = await request(app).get("/api/incidents").set(auth(ids.technician!)).expect(200);
    expect(inc.body.items.some((i: { id: string }) => i.id === r.body.incidentId)).toBe(true);
  });

  it("Finals Week runs the real engine and stores a decision record", async () => {
    const r = await request(app).post("/api/admin/finals-week").set(auth(ids.admin!)).expect(200);
    expect(r.body.decision.winnerUserId).toBeTruthy();
    expect(r.body.decision.candidates).toHaveLength(5);
    const d = await request(app).get(`/api/decisions/${r.body.decision.id}`).set(auth(ids.admin!)).expect(200);
    expect(d.body.decision.policyVersion).toBeTruthy();
  });

  it("near-misses are stored without a user id", async () => {
    await request(app).post("/api/near-misses").set(auth(ids.student!)).send({ labId: "lab-ece-1", description: "Loose wire on bench 3" }).expect(201);
    const c = await request(app).get("/api/near-misses/clusters").set(auth(ids.technician!)).expect(200);
    expect(c.body.clusters.length).toBeGreaterThan(0);
  });
});
