// Prints the unit-test coverage totals (coverage/coverage-summary.json from npm run test:coverage) as a
// Markdown table for the GitHub job summary.
import { readFileSync } from 'node:fs';

const { total } = JSON.parse(readFileSync(new URL('../coverage/coverage-summary.json', import.meta.url), 'utf8'));
const rows = [['Lines', total.lines], ['Statements', total.statements], ['Branches', total.branches], ['Functions', total.functions]];
console.log('### Unit test coverage\n');
console.log('| Metric | Covered | Total | % |');
console.log('|---|---:|---:|---:|');
for (const [name, metric] of rows) console.log(`| ${name} | ${metric.covered} | ${metric.total} | ${metric.pct}% |`);
