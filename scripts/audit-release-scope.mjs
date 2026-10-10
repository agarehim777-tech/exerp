export const deferredNotificationFlow = 'notification-provider-dispatch-workflow';

export function auditReleaseScope(allFlows, env) {
  if (allFlows.length !== 21 || new Set(allFlows.map(([name]) => name)).size !== 21) {
    throw new Error('AUDIT_RELEASE_SUITE_INCOMPLETE');
  }
  const deferred = env.AUDIT_DEFER_NOTIFICATION_PROVIDER === 'true' ? [{
    name: deferredNotificationFlow,
    reason: 'External notification provider is not connected. Deferred by the user; delivery is disabled, not passed.',
  }] : [];
  const required = allFlows.filter(([name]) => !deferred.some(item => item.name === name));
  return { required, deferred, expected: 21 - deferred.length };
}
