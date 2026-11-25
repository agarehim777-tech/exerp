// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { transform } from 'lightningcss';
import { describe, expect, it } from 'vitest';
import { legacyModuleAliases, moduleRoutes } from '../config/routes.js';
import { pageMeta } from '../config/page-meta.js';

// Guards for the visual review of 2026-11-25.
function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : cssFiles(path);
    return name.endsWith('.css') ? [path] : [];
  });
}
const files = cssFiles('src');
const count = (text, re) => (text.match(re) || []).length;
const STANDARD = /(^|[^-])backdrop-filter\s*:/g;

describe('visual guards', () => {
  it('gives every page a title and subtitle (the App page header and the browser tab use them)', () => {
    const missing = Object.keys(moduleRoutes).filter((id) => !(id in legacyModuleAliases) && !pageMeta[id]?.title);
    expect(missing).toEqual([]);
  });

  it('keeps the standard backdrop-filter through the CSS minifier', () => {
    // lightningcss drops `backdrop-filter` when a hand-written -webkit- copy follows it, so Chrome and Edge
    // lost the blur and the 72% transparent topbar showed the page through it. The build adds the prefix itself.
    const targets = { chrome: 111 << 16, edge: 111 << 16, firefox: 114 << 16, safari: (16 << 16) | (4 << 8) };
    const lost = files.filter((file) => {
      const code = readFileSync(file, 'utf8');
      const before = count(code, STANDARD);
      if (!before) return false;
      const out = transform({ filename: file, code: Buffer.from(code), minify: true, targets, errorRecovery: true }).code.toString();
      return count(out, STANDARD) < before;
    });
    expect(lost).toEqual([]);
  });

  it('keeps the landing logo letter dark on the gold mark', () => {
    // `.xp-brand span` (gold text) used to win over `.xp-mark`, so the "E" had the same colour as its background.
    expect(readFileSync('src/auth/Login.jsx', 'utf8')).toMatch(/\.xp-brand \.xp-mark \{[^}]*color:#0b1f1a/);
  });

  it('keeps the production form fields shrinkable on phones', () => {
    const css = readFileSync('src/modules/production/production.css', 'utf8');
    expect(css).toMatch(/\.production-ledger \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.production-fields \{[^}]*grid-template-columns: minmax\(0, 2fr\)/);
    expect(css).toMatch(/@media \(max-width: 900px\) \{ \.production-fields \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
});
