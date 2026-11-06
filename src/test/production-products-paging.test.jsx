import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

// PostgREST caps every response at 1000 rows. The production form must still offer products
// past that cap, otherwise a tenant with many products cannot pick its newest ones.
const TOTAL = 1200;
const MAX_ROWS = 1000;
const products = Array.from({ length: TOTAL }, (_, i) => ({ id: 'p' + i, name: 'Product ' + String(i).padStart(4, '0'), sku: 'SKU' + i }));

vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: 'tenant-a' }) }));
vi.mock('../shared/hooks/usePermissions.js', () => ({ usePermissions: () => ({ canEdit: () => true }) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  from: table => {
    let from = 0, to = Infinity;
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      range: (start, end) => { from = start; to = end; return chain; },
      then: resolve => {
        const rows = table === 'products' ? products.slice(from, Math.min(to + 1, from + MAX_ROWS)) : [];
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return chain;
  },
} }));

import ProductionLedgerPage from '../modules/production/ProductionLedgerPage.jsx';

afterEach(cleanup);

it('offers every active product, past the 1000-row response cap', async () => {
  render(<ProductionLedgerPage />);
  const select = screen.getByLabelText('Hazır məhsul');
  await waitFor(() => expect(select.querySelector('option[value="p' + (TOTAL - 1) + '"]')).not.toBeNull());
  expect(select.querySelectorAll('option[value^="p"]').length).toBe(TOTAL);
});
