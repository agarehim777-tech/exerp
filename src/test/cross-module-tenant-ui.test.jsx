import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ tenant: 'tenant-a', filters: [] }));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: mocks.tenant }) }));
vi.mock('../shared/hooks/usePermissions.js', () => ({ usePermissions: () => ({ canEdit: () => true }) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  from: table => {
    const chain = {
      select: () => chain,
      eq: (column, value) => { mocks.filters.push({ table, column, value }); return chain; },
      order: () => chain, limit: () => chain,
      then: resolve => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  },
} }));
import ProductionLedgerPage from '../modules/production/ProductionLedgerPage.jsx';
import IntegrationLedgerPage from '../modules/integrations/IntegrationLedgerPage.jsx';

beforeEach(() => { mocks.tenant = 'tenant-a'; mocks.filters = []; });
afterEach(cleanup);
for (const [Component, table] of [[ProductionLedgerPage, 'production_batches'], [IntegrationLedgerPage, 'webhook_dispatches']]) {
  it('uses the actual auth tenant field for ' + table + ' and reloads on tenant switch', async () => {
    const { rerender } = render(<Component />);
    await waitFor(() => expect(mocks.filters).toContainEqual({ table, column: 'tenant_id', value: 'tenant-a' }));
    mocks.tenant = 'tenant-b';
    rerender(<Component />);
    await waitFor(() => expect(mocks.filters).toContainEqual({ table, column: 'tenant_id', value: 'tenant-b' }));
    expect(mocks.filters.filter(row => row.column === 'tenant_id').every(row => !!row.value)).toBe(true);
  });
}
