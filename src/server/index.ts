/** Cloud Run / local entry point: serves the API and the built web app on one port. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { log } from "./log.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/server/server/index.js → dist/web
const staticDir = path.resolve(here, "../../web");
const { PORT } = config();
createApp({ staticDir }).listen(PORT, () => log.info("listening", { port: PORT }));
