import React, { Component } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

// Safety net for splitting App.jsx: every routed module must still mount
// without throwing. Supabase is replaced by an inert chain that answers every
// query with an empty result, so this checks wiring only, not data behaviour.
const supabaseMock = vi.hoisted(() => {
  const empty = { data: [], error: null, count: 0 };
  const subscription = { unsubscribe: () => {} };
  const chain = () => new Proxy(function inert() {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(empty).then(resolve, reject);
      if (prop === 'data') return { subscription, session: null, user: null };
      if (prop === 'error') return null;
      return chain();
    },
    apply: () => chain(),
  });
  return chain();
});

vi.mock('../integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('../auth/AuthProvider.jsx', () => {
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'smoke@example.invalid' };
  const membership = { tenant_id: '00000000-0000-4000-8000-0000000000aa', role: 'owner', tenant: { name: 'Smoke' } };
  const auth = {
    user, session: { user }, loading: false, isPlatformAdmin: false,
    activeTenantId: membership.tenant_id, activeMembership: membership, memberships: [membership],
    profile: { id: user.id, active_tenant_id: membership.tenant_id, full_name: 'Smoke Test' },
    canEdit: () => true, refresh: async () => {}, setActiveTenant: async () => {}, signOut: async () => {},
  };
  return { useAuth: () => auth, AuthProvider: ({ children }) => children };
});

import { moduleRoutes } from '../config/routes.js';
import AppDialogProvider from '../shared/ui/AppDialogProvider.jsx';
import { PageQueryProvider } from '../shared/hooks/usePageQuery.jsx';
import App from '../App.jsx';

class Catch extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <pre data-testid="crash">{String(this.state.error?.stack || this.state.error)}</pre> : this.props.children; }
}

// jsdom has no layout engine; the assistant page scrolls its transcript on mount.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

afterEach(cleanup);

for (const [module, path] of Object.entries(moduleRoutes)) {
  it(`mounts the ${module} route (${path}) without crashing`, async () => {
    const view = render(
      <MemoryRouter initialEntries={[path]}>
        <Catch>
          <AppDialogProvider>
            <PageQueryProvider scope="smoke"><App /></PageQueryProvider>
          </AppDialogProvider>
        </Catch>
      </MemoryRouter>,
    );
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    await waitFor(() => expect(view.container.querySelector('main, .app-shell, [class*="shell"]')).not.toBeNull());
    expect(view.queryByTestId('crash')?.textContent ?? null).toBeNull();
  }, 20000);
}
