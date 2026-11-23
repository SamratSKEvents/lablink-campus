// Vercel serverless entry: the same Express app as Cloud Run, bundled by scripts/build-api.mjs.
// Vercel serves the SPA from dist/web; this function handles /api/* and /health.
// Firestore's gRPC stack stays unbundled; importing it here lets Vercel trace and ship it.
import "@google-cloud/firestore";
import { createApp } from "../dist/api/app.mjs";

export default createApp();
