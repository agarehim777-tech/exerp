// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const step = name => ci.split('      - name: ' + name + '\n')[1]?.split('\n      - ')[0];
it('keeps identity provisioning mandatory without suppressing independent business diagnostics', () => {
  expect(step('Provision restricted staging audit identity')).toBeDefined();
  expect(step('Provision restricted staging audit identity')).not.toContain('continue-on-error');
  expect(step('Restricted identity authorization gate')).toContain("steps.readonly_identity.outcome == 'success'");
  for (const name of ['Browser and tenant-isolation tests', 'Sales and expense lifecycle tests',
    'Concurrent server lifecycle tests', 'Credit deposit lifecycle', 'Delivery and reversal lifecycle matrix',
    'All 21 business lifecycle flows']) {
    expect(step(name)).toContain("!cancelled() && steps.browser_runtime.outcome == 'success'");
    expect(step(name)).not.toContain('continue-on-error');
  }
});
it('requires a successful release gate before real HTTP verification and still deploys only successful CI', () => {
  expect(step('Signed HTTP delivery and replay gate')).toContain("!cancelled() && steps.release_gates.outcome == 'success'");
  expect(step('Signed HTTP delivery and replay gate')).toContain('node scripts/verify-signed-http.mjs');
  const deploy = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
  expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
});
