// Competition rules: exactly one branch, repo under 10 MB (we fail at 9 MB for headroom),
// and no secrets tracked. Run with `npm run presubmit` before submitting.
import { execSync } from "node:child_process";

const sh = (c) => execSync(c, { encoding: "utf8" }).trim();
let ok = true;
const fail = (m) => {
  ok = false;
  console.error(`✗ ${m}`);
};

const branches = sh("git branch -a --format=%(refname:short)").split("\n").filter((b) => b && !b.includes("HEAD"));
const local = branches.filter((b) => !b.startsWith("origin/"));
if (local.length !== 1) fail(`Expected exactly 1 branch, found ${local.length}: ${local.join(", ")}`);
else console.info(`✓ One branch: ${local[0]}`);

const stats = Object.fromEntries(sh("git count-objects -v").split("\n").map((l) => l.split(": ")));
const kb = Number(stats["size-pack"] ?? 0) + Number(stats.size ?? 0);
if (kb > 9 * 1024) fail(`Repository is ${(kb / 1024).toFixed(1)} MB (limit 10 MB, we stop at 9 MB)`);
else console.info(`✓ Repository size ${(kb / 1024).toFixed(2)} MB`);

const tracked = sh("git ls-files");
for (const bad of [/^\.env$/m, /service-account.*\.json$/m, /firebase-adminsdk.*\.json$/m])
  if (bad.test(tracked)) fail(`A secret-looking file is tracked: ${bad}`);
const leaks = sh("git grep -nIE \"(AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|AQ[.][A-Za-z0-9_-]{30,})\" -- . \":(exclude)package-lock.json\" || true");
if (leaks) fail(`Possible API key in tracked files:\n${leaks}`);
else console.info("✓ No secrets tracked");

process.exit(ok ? 0 : 1);
