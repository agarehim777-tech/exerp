// Type-checks the JavaScript files (checkJs, non-strict) and fails only on errors that are not in
// the baseline. Most of src is still .js/.jsx; turning checkJs on everywhere at once would mean
// hundreds of fixes in one PR, so the existing errors are recorded per file and may only go down.
//
//   npm run typecheck:js            check against scripts/checkjs-baseline.json
//   npm run typecheck:js -- --update rewrite the baseline (only after fixing errors, never to hide new ones)
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const baselinePath = fileURLToPath(new URL('./checkjs-baseline.json', import.meta.url));
const update = process.argv.includes('--update');

const tsgo = fileURLToPath(new URL('../node_modules/@typescript/native-preview/bin/tsgo', import.meta.url));
const run = spawnSync(process.execPath, [tsgo, '--noEmit', '-p', 'tsconfig.checkjs.json'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${run.stdout || ''}${run.stderr || ''}`;
const errorLine = /^(.+?)\(\d+,\d+\): error (TS\d+):/;
const current = {};
for (const line of output.split(/\r?\n/)) {
  const match = errorLine.exec(line);
  if (!match) continue;
  const file = match[1].replace(/\\/g, '/');
  current[file] = (current[file] || 0) + 1;
}
const total = (counts) => Object.values(counts).reduce((sum, n) => sum + n, 0);
if (run.status !== 0 && total(current) === 0) {
  console.error(output);
  console.error('checkjs: the type checker failed without reporting file errors.');
  process.exit(1);
}

if (update) {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`checkjs: baseline written, ${total(current)} errors in ${Object.keys(current).length} files.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const worse = Object.entries(current).filter(([file, n]) => n > (baseline[file] || 0));
const better = Object.entries(baseline).filter(([file, n]) => (current[file] || 0) < n);

if (worse.length) {
  console.error('checkjs: new type errors in JavaScript files (fix them, or move the file to TypeScript):');
  for (const [file, n] of worse) {
    console.error(`  ${file}: ${n} errors, baseline ${baseline[file] || 0}`);
    for (const line of output.split(/\r?\n/)) if (line.replace(/\\/g, '/').startsWith(`${file}(`)) console.error(`    ${line}`);
  }
  process.exit(1);
}
console.log(`checkjs: ${total(current)} errors in ${Object.keys(current).length} files, none new (baseline ${total(baseline)}).`);
if (better.length) {
  console.log(`checkjs: ${better.length} files improved; run "npm run typecheck:js -- --update" to lock that in.`);
}
