// Tenant admin provisioning for platform-provision-admin, kept free of Deno and Supabase imports so it can be tested.
//
// The auth user, the profile and the tenant membership are three separate writes. If a write after creating the
// auth user fails, the new user is deleted again: otherwise the account exists, a retry finds it, grants only the
// membership and never returns a password, and nobody can sign in to it.

export const TENANT_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type TenantRole = typeof TENANT_ROLES[number];

export interface ProvisionDeps {
  tenantExists(tenantId: string): Promise<boolean>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createUser(email: string, password: string): Promise<{ id: string }>;
  deleteUser(userId: string): Promise<void>;
  saveProfile(userId: string, email: string, tenantId: string): Promise<void>;
  saveMembership(tenantId: string, userId: string, role: TenantRole): Promise<void>;
  tempPassword(): string;
}

export interface ProvisionResult {
  status: number;
  body: { email?: string; password?: string | null; user_id?: string; created?: boolean; error?: string };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function provisionTenantAdmin(
  input: { tenant_id?: unknown; email?: unknown; role?: unknown },
  deps: ProvisionDeps,
): Promise<ProvisionResult> {
  const tenantId = String(input.tenant_id || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const role = String(input.role || "admin") as TenantRole;
  if (!tenantId || !email) return { status: 400, body: { error: "tenant_id və email tələb olunur" } };
  if (!EMAIL.test(email)) return { status: 400, body: { error: "Email düzgün deyil" } };
  if (!TENANT_ROLES.includes(role)) return { status: 400, body: { error: "Rol düzgün deyil" } };
  // Checked before any write, so a wrong tenant never leaves an auth user behind.
  if (!(await deps.tenantExists(tenantId))) return { status: 404, body: { error: "Şirkət tapılmadı" } };

  const existing = await deps.findUserByEmail(email);
  let userId: string;
  let password: string | null = null;
  let created = false;
  if (existing) {
    // Never reset an existing account's password: only grant tenant membership.
    userId = existing.id;
  } else {
    password = deps.tempPassword();
    try {
      userId = (await deps.createUser(email, password)).id;
    } catch (error) {
      return { status: 400, body: { error: (error as Error).message || "İstifadəçi yaradıla bilmədi" } };
    }
    created = true;
  }

  try {
    await deps.saveProfile(userId, email, tenantId);
    await deps.saveMembership(tenantId, userId, role);
  } catch (error) {
    if (!created) return { status: 500, body: { error: (error as Error).message } };
    try {
      await deps.deleteUser(userId);
    } catch {
      return { status: 500, body: { error: `${(error as Error).message}. Yaradılan hesab silinmədi (${email}); onu əl ilə silib yenidən cəhd edin.` } };
    }
    return { status: 500, body: { error: `${(error as Error).message}. Yaradılan hesab geri alındı; yenidən cəhd edin.` } };
  }
  return { status: 200, body: { email, password, user_id: userId, created } };
}
