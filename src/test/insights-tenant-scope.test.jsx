import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ tenant: 'A', invoke: vi.fn(), insert: vi.fn() }));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: mocks.tenant }) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: (...args) => mocks.invoke(...args) },
  from: () => ({ insert: (...args) => mocks.insert(...args), select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
} }));
import InsightsPage from '../modules/assistant/InsightsPage.jsx';
beforeEach(() => { mocks.tenant = 'A'; mocks.invoke.mockReset(); mocks.insert.mockReset(); });
afterEach(cleanup);
it('ignores late generation from a previous tenant visit', async () => {
  let resolve;
  mocks.invoke.mockReturnValue(new Promise((done) => { resolve = done; }));
  const { rerender } = render(<InsightsPage />);
  fireEvent.click(screen.getByRole('button', { name: /Təhlil et/ }));
  mocks.tenant = 'B'; rerender(<InsightsPage />);
  await act(async () => resolve({ data: { insights: [{ key: 'a', title: 'Tenant A private data' }] }, error: null }));
  expect(screen.queryByText('Tenant A private data')).toBeNull();
  expect(screen.getByRole('button', { name: /Təhlil et/ })).not.toBeDisabled();
});
it('does not confirm feedback that failed to persist and allows retry', async () => {
  mocks.invoke.mockResolvedValue({ data: { insights: [{ key: 'one', title: 'Test insight' }] }, error: null });
  mocks.insert.mockResolvedValue({ error: { message: 'Write rejected' } });
  render(<InsightsPage />);
  fireEvent.click(screen.getByRole('button', { name: /Təhlil et/ }));
  await screen.findByText('Test insight');
  fireEvent.click(screen.getByRole('button', { name: /Qəbul et/ }));
  await screen.findByText('Write rejected');
  expect(screen.queryByText(/Rəy yadda saxlanıldı/)).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: /Qəbul et/ })).not.toBeDisabled());
});
