# Architecture

## One app, two hosts

`src/server/app.ts` builds the Express app. `src/server/index.ts` serves it with the built web app on Cloud Run (`Dockerfile`); `api/index.js` exports the same compiled app as a Vercel function while Vercel serves `dist/web`.

## Folders map to the problem statement

| Folder | Responsibility |
|---|---|
| `src/shared` | Domain types, zod input schemas, equipment catalogue, time helpers (UTC stored, Asia/Kolkata shown), staff SOS text, instrument controls. Used by server, web and tests. |
| `src/server/auth` | ID-card tokens (`LL1.<card>.<version>.<HMAC>`), staff PIN lockout, card sign-in, revocation. |
| `src/server/discovery` | Catalogue, natural-language search, live status, equivalents, instrument explainer. |
| `src/server/projects` | Describe → plan, project creation, Feasibility Passport, project-based requests. |
| `src/server/approvals` | Faculty queue, copilot, PIN-confirmed decisions, deadline/stage verification. |
| `src/server/allocation` | The engine: hard rules, scheduler, fairness, rescue, what-if, benchmark; plus decision, waitlist and Finals Week routes. Pure functions over an `EngineContext` snapshot. |
| `src/server/bookings` | Slot-lock transactions, hold → confirm, check-in, completion. |
| `src/server/safety` | Guardian merge, hazard table, wellness, SOS, faults, incidents, certifications, near-misses, evacuation plans. |
| `src/server/utilisation` | Booked vs used, demand heatmap, Lorenz inputs, Opportunity Radar. |
| `src/server/ai` | The single AI gateway, every AI use with its schema and fallback, plan templates. |
| `src/web/features` | One folder per area, mirroring the server. |
| `src/web/three` | Lazy-loaded 3D: lab twin, Project X-Ray, instrument explainer, plus the list/3D toggle. |

## Request lifecycle: booking a project

1. `POST /api/projects/:id/hold` with an idempotency key.
2. Middleware verifies the Firebase ID token (`checkRevoked`) and reads the role from server-set claims.
3. If the key was seen before, the original bookings are returned (no double booking on retry).
4. `loadContext()` snapshots units, labs, users and recent bookings; `scheduleProject()` places the whole chain.
5. `holdBundle()` reads every seat-slot lock in one Firestore transaction. If any is taken, nothing is written and the route re-plans once.
6. `POST /confirm` re-checks every hard rule (approval is permission, not a reservation) and confirms.

## Concurrency without a scheduler

Locks are `slotLocks/{equipmentId}_{YYYYMMDDHHmm}_{seat}`. A held lock past `expiresAt`, or a confirmed booking with no check-in 15 minutes after its start, counts as free *inside the transaction*. So Cloud Run or Vercel can scale to zero without a cron job.

## AI gateway

`generate({ task, system, prompt, schema, fallback })` hashes the request for a TTL cache and in-flight de-duplication, tries Gemini (structured JSON, low thinking), retries once on transient errors, falls back to Groq, then to the deterministic template, validating with zod at every step.

## Performance notes

- The scheduler is greedy with bounded backtracking (3 options per task, depth 3). The full 1,000-request benchmark (both strategies) runs in under 30 seconds on a laptop; a single project plans in milliseconds.
- Booking lookups by unit and by user are indexed once per snapshot (a `WeakMap` on the bookings array).
- three.js (about 320 kB gzipped) is its own chunk and loads only when a 3D view opens; phones start in list view.
