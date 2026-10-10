import { expect, it } from 'vitest';
import { auditReleaseScope, deferredNotificationFlow } from '../../scripts/audit-release-scope.mjs';
const flows = [[deferredNotificationFlow, () => {}], ...Array.from({ length: 20 }, (_, i) => ['business-' + i, () => {}])];
it('requires all 21 flows by default', () => {
  expect(auditReleaseScope(flows, {})).toMatchObject({ expected: 21, deferred: [] });
});
it('defers only the authorized unconfigured external provider and preserves all 20 remaining gates', () => {
  const scope = auditReleaseScope(flows, { AUDIT_DEFER_NOTIFICATION_PROVIDER: 'true', AUDIT_SKIP_ALL: 'true' });
  expect(scope.expected).toBe(20);
  expect(scope.required).toHaveLength(20);
  expect(scope.deferred).toHaveLength(1);
  expect(scope.deferred[0].name).toBe(deferredNotificationFlow);
});
it('rejects missing or duplicate release scenarios', () => {
  expect(() => auditReleaseScope(flows.slice(1), {})).toThrow('INCOMPLETE');
  expect(() => auditReleaseScope([flows[0], ...flows.slice(0, 20)], {})).toThrow('INCOMPLETE');
});
