import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ValuationPanel from '../modules/warehouse/ValuationPanel.jsx';

afterEach(cleanup);

it('does not present zero valuation while the history is still loading', () => {
  render(<ValuationPanel loadMovements={() => new Promise(() => {})} />);
  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

it('shows a failure instead of partial or zero valuation after a history error', async () => {
  render(<ValuationPanel loadMovements={vi.fn().mockRejectedValue(new Error('timeout'))} />);
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});

it('shows a completed empty history as a valid report', async () => {
  render(<ValuationPanel loadMovements={vi.fn().mockResolvedValue([])} />);
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  expect(screen.queryByRole('alert')).toBeNull();
});
