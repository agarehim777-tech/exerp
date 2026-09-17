import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(target);
    return /\.[jt]sx?$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

describe("dialog policy", () => {
  it("does not use native alert, confirm or prompt", async () => {
    const files = await sourceFiles(path.resolve("src"));
    const violations = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)) violations.push(path.relative(process.cwd(), file));
    }
    expect(violations).toEqual([]);
  });
});
