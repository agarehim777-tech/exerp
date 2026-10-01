import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ listener: null, getSession: vi.fn(), pending: [] }));
vi.mock('../lib/observability', () => ({ setUser: vi.fn() }));
vi.mock('../lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  auth: { onAuthStateChange: (listener) => { mocks.listener = listener; return { data: { sub: null, subscription: { unsubscribe: vi.fn() } } }; },
    getSession: () => mocks.getSession() },
  from: (table) => ({ select: () => ({ eq: (_field, uid) => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    promise.maybeSingle = () => promise;
    mocks.pending.push({ table, uid, resolve });
    return promise;
  } }) }),
} }));
import { AuthProvider, useAuth } from '../auth/AuthProvider.jsx';
function Probe() {
  const auth = useAuth();
  return <output data-testid="auth">{JSON.stringify({ uid: auth.user?.id, tenant: auth.activeTenantId, loading: auth.loading })}</output>;
}
const state = () => JSON.parse(screen.getByTestId('auth').textContent);
const finish = (uid) => mocks.pending.filter((row) => row.uid === uid).forEach((row) => row.resolve({ error: null,
  data: row.table === 'profiles' ? { active_tenant_id: `tenant-${uid}` }
    : row.table === 'tenant_members' ? [{ tenant_id: `tenant-${uid}`, role: 'admin' }] : null,
}));
beforeEach(() => { mocks.pending = []; mocks.getSession.mockReset(); });
afterEach(cleanup);
it('an old profile response cannot replace the current user tenant', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(state().loading).toBe(false));
  act(() => mocks.listener('SIGNED_IN', { user: { id: 'A' } }));
  await waitFor(() => expect(mocks.pending.filter((row) => row.uid === 'A')).toHaveLength(3));
  act(() => mocks.listener('SIGNED_IN', { user: { id: 'B' } }));
  await waitFor(() => expect(mocks.pending.filter((row) => row.uid === 'B')).toHaveLength(3));
  await act(async () => finish('B'));
  expect(state()).toEqual({ uid: 'B', tenant: 'tenant-B', loading: false });
  await act(async () => finish('A'));
  expect(state()).toEqual({ uid: 'B', tenant: 'tenant-B', loading: false });
});
it('a late initial session cannot overwrite a newer auth event', async () => {
  let resolve;
  mocks.getSession.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<AuthProvider><Probe /></AuthProvider>);
  act(() => mocks.listener('SIGNED_IN', { user: { id: 'B' } }));
  await waitFor(() => expect(mocks.pending).toHaveLength(3));
  await act(async () => finish('B'));
  await act(async () => resolve({ data: { session: null } }));
  expect(state()).toEqual({ uid: 'B', tenant: 'tenant-B', loading: false });
});
