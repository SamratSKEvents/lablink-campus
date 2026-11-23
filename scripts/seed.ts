/** Seed the demo institution. Locally: run against the emulators (npm run emulators). */
import { seedDemo } from "../src/server/seed/seed.js";

if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_SERVICE_ACCOUNT && !process.argv.includes("--production")) {
  console.error("Refusing to seed: no emulator detected. Pass --production to seed a real project.");
  process.exit(1);
}
const result = await seedDemo();
console.info("Seeded", result);
process.exit(0);
