import { describe, expect, it, vi } from 'vitest';
import { canReadTenant, tenantSelect } from '../../supabase/functions/erp-chat/tenant-data.js';

const tenant = '00000000-0000-0000-0000-000000000001';
function client(result = {}) {
  const q = { select: vi.fn(() => q), eq: vi.fn(() => q), maybeSingle: vi.fn(async () => result) };
  return { from: vi.fn(() => q), q };
}

describe('AI tenant data access', () => {
  it.each(['customers', 'products', 'orders', 'quotes', 'employees', 'projects'])('scopes %s, including count requests', table => {
    const db = client();
    tenantSelect(db, tenant, table, '*', { count: 'exact', head: true });
    expect(db.q.eq).toHaveBeenCalledWith('tenant_id', tenant);
    expect(db.q.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
  });
  it('rejects missing tenants and unlisted tables before querying', () => {
    const db = client();
    expect(() => tenantSelect(db, undefined, 'orders', '*')).toThrow();
    expect(() => tenantSelect(db, tenant, 'tenant_state_snapshots', '*')).toThrow();
    expect(db.from).not.toHaveBeenCalled();
  });
  it('requires membership for the exact user and selected tenant', async () => {
    const db = client({ data: { tenant_id: tenant }, error: null });
    expect(await canReadTenant(db, tenant, 'user')).toBe(true);
    expect(db.q.eq.mock.calls).toEqual([['tenant_id', tenant], ['user_id', 'user']]);
    expect(await canReadTenant(client({ data: null }), tenant, 'user')).toBe(false);
    expect(await canReadTenant(client({ data: { tenant_id: 'other' } }), tenant, 'user')).toBe(false);
  });
  it('fails closed on membership query failure', async () => {
    await expect(canReadTenant(client({ error: new Error('offline') }), tenant, 'user')).rejects.toThrow('offline');
  });
});
