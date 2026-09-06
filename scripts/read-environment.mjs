import fs from "node:fs";
import path from "node:path";

export function readEnvironment() {
  const values = { ...process.env };
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.resolve(filename);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
      if (!match || values[match[1]]) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
  return values;
}
