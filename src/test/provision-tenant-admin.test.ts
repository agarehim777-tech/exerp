import { describe, expect, it, vi } from 'vitest';
import { provisionTenantAdmin, type ProvisionDeps } from '../../supabase/functions/_shared/provisionTenantAdmin.ts';

function deps(overrides: Partial<ProvisionDeps> = {}) {
  const users = new Map<string, string>();
  const calls: string[] = [];
  const base: ProvisionDeps = {
    tenantExists: vi.fn(async () => true),
    findUserByEmail: vi.fn(async (email) => (users.has(email) ? { id: users.get(email)! } : null)),
    createUser: vi.fn(async (email) => { users.set(email, 'U1'); calls.push('create'); return { id: 'U1' }; }),
    deleteUser: vi.fn(async (id) => { for (const [email, uid] of users) if (uid === id) users.delete(email); calls.push('delete'); }),
    saveProfile: vi.fn(async () => { calls.push('profile'); }),
    saveMembership: vi.fn(async () => { calls.push('membership'); }),
    tempPassword: () => 'Temp-Pass-1',
  };
  return { d: { ...base, ...overrides }, users, calls };
}

describe('tenant admin provisioning', () => {
  it('creates the user, profile and membership and returns the temporary password', async () => {
    const { d } = deps();
    const result = await provisionTenantAdmin({ tenant_id: 'T1', email: ' Admin@Shop.az ' }, d);
    expect(result).toEqual({ status: 200, body: { email: 'admin@shop.az', password: 'Temp-Pass-1', user_id: 'U1', created: true } });
  });

  it('deletes a newly created user when the membership cannot be saved, so a retry works', async () => {
    const { d, users, calls } = deps({ saveMembership: vi.fn(async () => { throw new Error('membership failed'); }) });
    const first = await provisionTenantAdmin({ tenant_id: 'T1', email: 'a@b.az' }, d);
    expect(first.status).toBe(500);
    expect(first.body.error).toMatch(/geri alındı/);
    expect(calls).toEqual(['create', 'profile', 'delete']);
    expect(users.size).toBe(0);

    d.saveMembership = vi.fn(async () => {});
    const retry = await provisionTenantAdmin({ tenant_id: 'T1', email: 'a@b.az' }, d);
    expect(retry.body).toMatchObject({ created: true, password: 'Temp-Pass-1' });
  });

  it('never deletes an existing account when granting it a membership fails', async () => {
    const { d, users } = deps({ saveMembership: vi.fn(async () => { throw new Error('membership failed'); }) });
    users.set('old@b.az', 'OLD');
    const result = await provisionTenantAdmin({ tenant_id: 'T1', email: 'old@b.az' }, d);
    expect(result.status).toBe(500);
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(users.get('old@b.az')).toBe('OLD');
  });

  it('checks the tenant, email and role before creating anything', async () => {
    const { d } = deps({ tenantExists: vi.fn(async () => false) });
    expect((await provisionTenantAdmin({ tenant_id: 'T9', email: 'a@b.az' }, d)).status).toBe(404);
    expect((await provisionTenantAdmin({ tenant_id: 'T1', email: 'not-an-email' }, d)).status).toBe(400);
    expect((await provisionTenantAdmin({ tenant_id: 'T1', email: 'a@b.az', role: 'superuser' }, d)).status).toBe(400);
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it('keeps an existing account password and grants only the membership', async () => {
    const { d, users } = deps();
    users.set('old@b.az', 'OLD');
    const result = await provisionTenantAdmin({ tenant_id: 'T1', email: 'old@b.az', role: 'member' }, d);
    expect(result.body).toEqual({ email: 'old@b.az', password: null, user_id: 'OLD', created: false });
    expect(d.createUser).not.toHaveBeenCalled();
  });
});
