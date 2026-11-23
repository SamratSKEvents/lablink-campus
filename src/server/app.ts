/**
 * The Express app: API + (optionally) the built SPA. Exported so the same app runs
 * on Cloud Run (src/server/index.ts) and Vercel (api/index.ts).
 */
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { adminRouter } from "./admin/routes.js";
import { allocationRouter } from "./allocation/routes.js";
import { approvalsRouter } from "./approvals/routes.js";
import { authRouter } from "./auth/routes.js";
import { bookingsRouter } from "./bookings/routes.js";
import { discoveryRouter } from "./discovery/routes.js";
import { errorHandler } from "./middleware/errors.js";
import { apiLimiter, securityHeaders } from "./middleware/security.js";
import { projectsRouter } from "./projects/routes.js";
import { safetyRouter } from "./safety/routes.js";
import { utilisationRouter } from "./utilisation/routes.js";

export function createApp(opts: { staticDir?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: "64kb" }));

  // Liveness: touches no database or AI, so it is always fast and cheap.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const api = express.Router();
  api.use(apiLimiter);
  for (const r of [authRouter, discoveryRouter, projectsRouter, approvalsRouter, bookingsRouter, allocationRouter, safetyRouter, utilisationRouter, adminRouter]) api.use(r);
  api.use((_req, res) => {
    res.status(404).json({ error: "No such endpoint.", code: "not_found" });
  });
  app.use("/api", (req, res, next) => {
    res.set("cache-control", "no-store");
    next();
  }, api);

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { maxAge: "1y", immutable: true, index: false }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.set("cache-control", "no-cache").sendFile(path.join(opts.staticDir!, "index.html"));
    });
  }
  app.use(errorHandler);
  return app;
}
