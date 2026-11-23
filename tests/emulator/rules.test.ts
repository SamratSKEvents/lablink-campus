/** Firestore security rules, tested with @firebase/rules-unit-testing on the emulator. */
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8081").split(":");
  env = await initializeTestEnvironment({ projectId: "demo-lablink-rules", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "notifications/n1"), { userId: "alice", text: "hi" });
    await setDoc(doc(db, "bookings/b1"), { userId: "alice" });
    await setDoc(doc(db, "projects/p1"), { ownerId: "alice" });
    await setDoc(doc(db, "incidents/i1"), { departmentId: "ece", userId: "alice" });
    await setDoc(doc(db, "evacuationPlans/alice"), { needs: ["wheelchair"] });
    await setDoc(doc(db, "users/alice"), { pinHash: "secret" });
  });
});
afterAll(async () => env?.cleanup());

const student = (uid = "alice") => env.authenticatedContext(uid, { role: "student", dept: "ece" }).firestore();
const staff = (role: string, dept = "ece") => env.authenticatedContext(`staff-${role}`, { role, dept }).firestore();

describe("firestore.rules", () => {
  it("denies every client write, even to your own documents", async () => {
    await assertFails(setDoc(doc(student(), "notifications/n2"), { userId: "alice" }));
    await assertFails(setDoc(doc(student(), "bookings/b1"), { userId: "alice", status: "confirmed" }));
    await assertFails(setDoc(doc(staff("admin"), "incidents/i2"), { departmentId: "ece" }));
  });
  it("students read only their own notifications, bookings and projects", async () => {
    await assertSucceeds(getDoc(doc(student(), "notifications/n1")));
    await assertSucceeds(getDoc(doc(student(), "bookings/b1")));
    await assertSucceeds(getDoc(doc(student(), "projects/p1")));
    await assertFails(getDoc(doc(student("bob"), "notifications/n1")));
    await assertFails(getDoc(doc(student("bob"), "bookings/b1")));
  });
  it("incidents are readable by same-department responders and security only", async () => {
    await assertSucceeds(getDoc(doc(staff("technician"), "incidents/i1")));
    await assertSucceeds(getDoc(doc(staff("security", "mech"), "incidents/i1")));
    await assertFails(getDoc(doc(staff("technician", "mech"), "incidents/i1")));
    await assertFails(getDoc(doc(student(), "incidents/i1")));
  });
  it("evacuation plans are private to the student", async () => {
    await assertSucceeds(getDoc(doc(student(), "evacuationPlans/alice")));
    await assertFails(getDoc(doc(staff("technician"), "evacuationPlans/alice")));
  });
  it("users (with PIN hashes) are never readable by clients", async () => {
    await assertFails(getDoc(doc(student(), "users/alice")));
    await assertFails(getDoc(doc(staff("admin"), "users/alice")));
  });
  it("unauthenticated clients read nothing", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "notifications/n1")));
  });
});
