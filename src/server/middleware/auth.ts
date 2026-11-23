/**
 * ID-token verification and role checks. Roles come only from server-set custom
 * claims, never from the request body. Revoked sessions (lost card) are rejected.
 */
import type { NextFunction, Request, Response } from "express";
import type { Role } from "../../shared/domain.js";
import { auth } from "../firebase.js";
import { HttpError } from "./errors.js";

export interface Actor {
  uid: string;
  role: Role;
  departmentId: string;
  demo: boolean;
  kiosk: boolean;
}

export interface AuthedRequest extends Request {
  actor: Actor;
}

/** Kiosk sessions (bench tablet) may only do check-in, SOS, faults and wellness. */
const KIOSK_MAX_AGE_S = 15 * 60;

export function requireAuth(roles?: readonly Role[], opts: { kioskAllowed?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (!token) throw new HttpError(401, "Please tap your ID card to sign in.", "unauthenticated");
      let decoded;
      try {
        decoded = await auth().verifyIdToken(token, true);
      } catch {
        throw new HttpError(401, "Your session has ended. Please tap your ID card again.", "unauthenticated");
      }
      const actor: Actor = {
        uid: decoded.uid,
        role: decoded.role as Role,
        departmentId: String(decoded.dept ?? ""),
        demo: decoded.demo === true,
        kiosk: decoded.kiosk === true,
      };
      if (actor.kiosk) {
        if (!opts.kioskAllowed) throw new HttpError(403, "Kiosk sessions can only check in, report faults or raise SOS.", "kiosk");
        if (Date.now() / 1000 - decoded.auth_time > KIOSK_MAX_AGE_S) throw new HttpError(401, "Kiosk session expired. Tap your card again.", "unauthenticated");
      }
      if (roles && !roles.includes(actor.role)) throw new HttpError(403, "This needs a different role.", "forbidden");
      (req as AuthedRequest).actor = actor;
      next();
    } catch (e) {
      next(e);
    }
  };
}
