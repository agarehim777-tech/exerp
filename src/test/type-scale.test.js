// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { expect, it } from 'vitest';

// One type scale for the app. 26 font sizes (11.5px, 15px, 0.78rem ...) and 16 weights (650, 760 ...) had
// crept in; Manrope is loaded at 400-700 and Sora at 500-800, so in-between weights were rounded by the
// browser. Use a step below (or a --font-size-* token) for new styles.
const SIZES = new Set([11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 48]);
const WEIGHTS = new Set([400, 500, 600, 700, 800]);

it('uses only the shared font sizes and weights', async () => {
  const files = execSync('git ls-files "src/**/*.css" "src/*.css" "src/**/*.jsx" "src/**/*.tsx"', { encoding: 'utf8' })
    .trim().split('\n').filter((file) => !file.endsWith('az-glyph-fallback.css') && !file.endsWith('auth/Login.jsx') && !file.includes('/test/'));
  const offScale = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/font-size:\s*([0-9.]+)(px|rem)\b/g)) {
      const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1]);
      if (!SIZES.has(px)) offScale.push(`${file}: font-size ${match[1]}${match[2]}`);
    }
    for (const match of source.matchAll(/(?:font-weight:\s*|fontWeight:\s*)([0-9]{3})\b/g)) {
      if (!WEIGHTS.has(Number(match[1]))) offScale.push(`${file}: font-weight ${match[1]}`);
    }
    for (const match of source.matchAll(/u-font-size-([0-9]+)px/g)) {
      if (!SIZES.has(Number(match[1]))) offScale.push(`${file}: u-font-size-${match[1]}px`);
    }
  }
  expect(offScale).toEqual([]);
});
