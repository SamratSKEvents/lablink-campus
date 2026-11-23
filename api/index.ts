/** Vercel serverless entry: the same Express app, API only (Vercel serves the SPA). */
import { createApp } from "../src/server/app.js";

export default createApp();
