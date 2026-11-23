/** Demo cards for judges, notifications, and "Reset demo" (the only destructive demo action). */
import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { config } from "../config.js";
import { signCardToken } from "../auth/cardToken.js";
import { all, C, col, publicUser, type Notification, type StoredUser } from "../data.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { forbidden, handle } from "../middleware/errors.js";
import { DEMO_CARDS } from "../seed/demo.js";
import { seedDemo } from "../seed/seed.js";

export const adminRouter = Router();

let cardsCache: unknown[] | null = null;

/** Public: the four demo ID cards, with real signed tokens and QR images. */
adminRouter.get(
  "/demo-cards",
  handle(async (_req, res) => {
    cardsCache ??= await Promise.all(
      DEMO_CARDS.map(async (c) => {
        const token = signCardToken(c.cardId, 1, config().CARD_HMAC_SECRET);
        const qrSvg = await QRCode.toString(token, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0c0a09", light: "#ffffff" } });
        return { cardId: c.cardId, role: c.role, label: c.label, name: c.name, token, qrSvg, ...("pin" in c ? { pin: c.pin } : {}) };
      }),
    );
    res.set("cache-control", "public, max-age=300").json({ cards: cardsCache });
  }),
);

adminRouter.get(
  "/notifications",
  requireAuth(undefined, { kioskAllowed: true }),
  handle<AuthedRequest>(async (req, res) => {
    const items = await all<Notification>(col(C.notifications).where("userId", "==", req.actor.uid).orderBy("at", "desc").limit(30));
    res.json({ items });
  }),
);

adminRouter.post(
  "/notifications/read",
  requireAuth(),
  handle<AuthedRequest>(async (req, res) => {
    const ids = z.array(z.string().max(64)).max(50).parse(req.body.ids ?? []);
    await Promise.all(ids.map(async (id) => {
      const ref = col(C.notifications).doc(id);
      const snap = await ref.get();
      if (snap.exists && snap.data()!.userId === req.actor.uid) await ref.update({ read: true });
    }));
    res.json({ ok: true });
  }),
);

adminRouter.post(
  "/admin/reset-demo",
  requireAuth(["admin"]),
  handle<AuthedRequest>(async (req, res) => {
    if (!req.actor.demo) throw forbidden("Reset is only available for the demo institution.");
    res.json({ ok: true, seeded: await seedDemo() });
  }),
);

/** Students in the staff member's department (for certification sign-off). */
adminRouter.get(
  "/students",
  requireAuth(["technician", "faculty", "admin"]),
  handle<AuthedRequest>(async (req, res) => {
    const q = col(C.users).where("role", "==", "student");
    const students = await all<StoredUser>(req.actor.role === "admin" ? q : q.where("departmentId", "==", req.actor.departmentId));
    res.json({ students: students.map(publicUser).map((u) => ({ id: u.id, name: u.name, certifications: u.certifications, tutorials: u.tutorials })) });
  }),
);
