// Vercel serverless entry: the same Express app as Cloud Run, compiled by `npm run build`.
// Vercel serves the SPA from dist/web; this function handles /api/* and /health.
import { createApp } from "../dist/server/server/app.js";

export default createApp();
