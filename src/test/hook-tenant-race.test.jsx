import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

// A late answer for the previous tenant must not replace the new tenant's rows (AGENTS.md: scope async reads
// to the current tenant). useDeals had no request scope; the same guard now sits in 14 data hooks.
const pending = vi.hoisted(() => new Map());
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      let tenant = null;
      const query = {
        select: () => query,
        eq: (column, value) => { if (column === 'tenant_id') tenant = value; return query; },
        order: () => new Promise((resolve) => pending.set(tenant, resolve)),
      };
      return query;
    },
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(),
  },
}));

import { useDeals } from '../shared/hooks/useDeals.js';

it('keeps the new tenant rows when the old tenant answers last', async () => {
  const { result, rerender } = renderHook(({ tenant }) => useDeals(tenant, `pipeline-${tenant}`), { initialProps: { tenant: 'A' } });
  await waitFor(() => expect(pending.has('A')).toBe(true));
  rerender({ tenant: 'B' });
  await waitFor(() => expect(pending.has('B')).toBe(true));
  await act(async () => { pending.get('B')({ data: [{ id: 'deal-B' }], error: null }); });
  await act(async () => { pending.get('A')({ data: [{ id: 'deal-A' }], error: null }); });
  expect(result.current.deals).toEqual([{ id: 'deal-B' }]);
});
