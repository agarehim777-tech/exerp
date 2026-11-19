// @vitest-environment node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createPrefixedId } from "../shared/utils/id.js";

it("keeps the prefix and stays unique for records created in the same millisecond", () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(1_795_000_000_000);
  try {
    const ids = Array.from({ length: 2000 }, () => createPrefixedId("SUP"));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids.slice(0, 20)) expect(id).toMatch(/^SUP-[0-9A-Z]+-[0-9A-Z]{6}$/);
  } finally {
    now.mockRestore();
  }
});

it("no longer repeats once the clock wraps a truncated timestamp", () => {
  // The old `Date.now().toString().slice(-5)` ids came back every 100 seconds.
  const first = vi.spyOn(Date, "now").mockReturnValue(1_795_000_012_345);
  const a = createPrefixedId("KB");
  first.mockReturnValue(1_795_000_112_345);
  const b = createPrefixedId("KB");
  first.mockRestore();
  expect(a).not.toBe(b);
  expect(a.split("-")[1]).not.toBe(b.split("-")[1]);
});

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
  }));
  return nested.flat();
}

it("state commands build record ids with createPrefixedId, not a bare timestamp", async () => {
  const files = await sourceFiles(join(process.cwd(), "src", "shared", "state"));
  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (/`[A-Z]+(?:-[A-Z]+)*-\$\{Date\.now\(\)/.test(text)) offenders.push(file);
  }
  expect(offenders).toEqual([]);
});
