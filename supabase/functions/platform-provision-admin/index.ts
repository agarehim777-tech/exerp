// Provisions an admin user for a tenant with a temporary password.
// Caller must be a platform admin. The steps and their rollback live in _shared/provisionTenantAdmin.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { findAuthUserByEmail } from "../_shared/findAuthUser.ts";
import { provisionTenantAdmin } from "../_shared/provisionTenantAdmin.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function tempPassword(len = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const specials = "!@#$%&*";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len - 2; i++) out += alphabet[bytes[i] % alphabet.length];
  out += specials[bytes[len - 2] % specials.length];
  out += String(bytes[len - 1] % 10);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false } });

    // Verify caller is platform admin
    const { data: pa } = await admin
      .from("platform_admins").select("user_id").eq("user_id", userRes.user.id).maybeSingle();
    if (!pa) return json({ error: "forbidden" }, 403);

    const result = await provisionTenantAdmin(await req.json(), {
      tempPassword: () => tempPassword(),
      async tenantExists(tenantId) {
        const { data, error } = await admin.from("tenants").select("id").eq("id", tenantId).maybeSingle();
        if (error) throw new Error("Tenant could not be read");
        return Boolean(data);
      },
      findUserByEmail: (email) => findAuthUserByEmail(options => admin.auth.admin.listUsers(options), email),
      async createUser(email, password) {
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw new Error(error?.message || "İstifadəçi yaradıla bilmədi");
        return { id: data.user.id };
      },
      async deleteUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw new Error(error.message);
      },
      async saveProfile(userId, email, tenantId) {
        // Ensure the profile row exists (id references auth.users) and set the active tenant when it has none.
        const { error: profileError } = await admin.from("profiles").upsert(
          { id: userId, email, active_tenant_id: tenantId },
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (profileError) throw new Error("Profile could not be saved");
        const { error: activeTenantError } = await admin.from("profiles").update({ active_tenant_id: tenantId }).eq("id", userId).is("active_tenant_id", null);
        if (activeTenantError) throw new Error("Active tenant could not be saved");
      },
      async saveMembership(tenantId, userId, role) {
        const { error } = await admin.from("tenant_members").upsert({ tenant_id: tenantId, user_id: userId, role }, { onConflict: "tenant_id,user_id" });
        if (error) throw new Error(error.message);
      },
    });
    return json(result.body, result.status);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
