// Competition submission checks. Run with `npm run presubmit`.
import { spawnSync } from "node:child_process";
import { posix } from "node:path";

const REPO_SIZE_LIMIT_KIB = 9 * 1024; // Keep headroom under the competition's 10 MB limit.
const KEY_PATTERN = "(AIza[0-9A-Za-z_-]{30,}|gsk_[A-Za-z0-9]{20,}|AQ[.][A-Za-z0-9_-]{30,})";

function git(args, { allowNoMatch = false } = {}) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  // git grep exits 1 for no matches. Other Git errors must fail the check.
  if (result.status !== 0 && !(allowNoMatch && result.status === 1)) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.trim() || (result.signal ?? result.status)}`);
  }
  return result.stdout;
}

function fail(message) {
  process.exitCode = 1;
  console.error(`✗ ${message}`);
}

const branches = git(["for-each-ref", "--format=%(refname:short)", "refs/heads"]).split(/\r?\n/).filter(Boolean);
if (branches.length === 1) console.info(`✓ One branch: ${branches[0]}`);
else fail(`Expected exactly 1 local branch, found ${branches.length}: ${branches.join(", ")}`);

const stats = Object.fromEntries(git(["count-objects", "-v"]).trim().split(/\r?\n/).map((line) => line.split(": ")));
const sizeKiB = Number(stats["size-pack"]) + Number(stats.size);
if (!Number.isFinite(sizeKiB)) fail("Could not determine repository size.");
else if (sizeKiB > REPO_SIZE_LIMIT_KIB) fail(`Repository is ${(sizeKiB / 1024).toFixed(1)} MB (9 MB presubmit threshold)`);
else console.info(`✓ Repository size ${(sizeKiB / 1024).toFixed(2)} MB`);

const trackedFiles = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const sensitivePaths = trackedFiles.filter((file) => {
  const name = posix.basename(file).toLowerCase();
  return (/^\.env(?:\.|$)/.test(name) && name !== ".env.example") || /(?:service-account|firebase-adminsdk).*\.json$/.test(name);
});
const matchedPaths = git(
  ["grep", "--cached", "--name-only", "-z", "-I", "-E", "-e", KEY_PATTERN, "--", ".", ":(exclude)package-lock.json"],
  { allowNoMatch: true },
).split("\0").filter(Boolean);
if (sensitivePaths.length) fail(`Sensitive file names in Git's index:\n${sensitivePaths.join("\n")}`);
if (matchedPaths.length) fail(`Possible API keys in Git's index:\n${matchedPaths.join("\n")}`);
if (!sensitivePaths.length && !matchedPaths.length) console.info("✓ No secret patterns found in Git's index");
