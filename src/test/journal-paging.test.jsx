import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

// Mühasibat jurnalı used to stop at the newest 200 entries without saying so. It now asks for one more row
// than the page to know whether older entries exist, and "load more" widens the page.
const limits = vi.hoisted(() => []);
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeMembership: { tenant_id: 'tenant-a' } }) }));
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        limit: async (n) => { limits.push(n); return { data: Array.from({ length: Math.min(n, 250) }, (_, i) => ({ id: `je-${i}` })), error: null }; },
      };
      return query;
    },
  },
}));

import { useJournalEntries } from '../shared/hooks/useAccounting.js';

it('pages the journal and reports when older entries exist', async () => {
  const { result } = renderHook(() => useJournalEntries());
  await waitFor(() => expect(result.current.entries).toHaveLength(200));
  expect(result.current.hasMore).toBe(true);
  expect(limits.at(-1)).toBe(201);
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.entries).toHaveLength(250));
  expect(result.current.hasMore).toBe(false);
});
