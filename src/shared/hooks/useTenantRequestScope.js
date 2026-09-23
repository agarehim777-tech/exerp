import { useCallback, useEffect, useRef } from 'react';

// Tokens are per tenant visit, not per tenant ID: A -> B -> A invalidates A's old requests.
export function useTenantRequestScope(tenantId) {
  const ref = useRef(null);
  if (!ref.current || ref.current.tenantId !== tenantId) {
    ref.current = { tenantId, requests: new Map() };
  }
  const scope = ref.current;
  useEffect(() => () => { scope.requests.clear(); }, [scope]);
  const begin = useCallback((lane = 'read') => {
    const token = {};
    scope.requests.set(lane, token);
    return () => ref.current === scope && scope.requests.get(lane) === token;
  }, [scope]);
  return { scope, begin };
}
