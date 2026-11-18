// CI dependency gate: fails on any high/critical npm advisory except the ones allowlisted below.
// An allowlist entry is for an advisory with no patched release yet; it stops applying after reviewBy,
// so CI turns red again and someone re-checks whether a fix exists. Remove the entry once a fix ships.
import { execFileSync } from "node:child_process";

export const ALLOWLIST = [
  {
    advisory: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    reason: "ReDoS via repeated extglobs; no patched picomatch release. Reaches us only through dev/build tools (vite, vitest, tinyglobby, fdir); production dependencies are clean.",
    reviewBy: "2027-01-31",
  },
];

const BLOCKING = new Set(["high", "critical"]);

export function findBlockingAdvisories(report, allowlist = ALLOWLIST, now = new Date()) {
  const active = new Set(allowlist.filter((entry) => now <= new Date(`${entry.reviewBy}T23:59:59Z`)).map((entry) => entry.advisory));
  const blocking = new Map();
  const ignored = new Map();
  for (const vulnerability of Object.values(report.vulnerabilities || {})) {
    for (const via of vulnerability.via || []) {
      if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue;
      (active.has(via.url) ? ignored : blocking).set(via.url, `${via.severity} ${via.name}: ${via.title} (${via.url})`);
    }
  }
  return { blocking: [...blocking.values()], ignored: [...ignored.values()] };
}

function readAuditReport() {
  try {
    return execFileSync("npm", ["audit", "--json"], { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    // npm audit exits non-zero when it finds anything; the JSON report is still on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("npm-audit-gate.mjs")) {
  const report = JSON.parse(readAuditReport());
  if (report.error) {
    console.error(`npm audit failed: ${report.error.summary || JSON.stringify(report.error)}`);
    process.exit(1);
  }
  const { blocking, ignored } = findBlockingAdvisories(report);
  for (const line of ignored) console.log(`allowlisted: ${line}`);
  if (blocking.length) {
    console.error("High/critical advisories:");
    for (const line of blocking) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log("npm audit gate: no high/critical advisories outside the allowlist.");
}
