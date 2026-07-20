// Provisions an admin user for a tenant with a temporary password.
// Caller must be a platform admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

    const { tenant_id, email, role = "admin" } = await req.json();
    if (!tenant_id || !email) return json({ error: "tenant_id və email tələb olunur" }, 400);
    const normalizedEmail = String(email).trim().toLowerCase();

    // Find or create the auth user
    let userId: string | null = null;
    let password: string | null = null;
    let created = false;

    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === normalizedEmail);
    if (existing) {
      userId = existing.id;
      password = tempPassword();
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (updErr) return json({ error: updErr.message }, 400);
    } else {
      password = tempPassword();
      const { data: cu, error: cErr } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });
      if (cErr || !cu.user) return json({ error: cErr?.message || "İstifadəçi yaradıla bilmədi" }, 400);
      userId = cu.user.id;
      created = true;
    }

    // Ensure profile row exists (id references auth.users)
    await admin.from("profiles").upsert({ id: userId, email: normalizedEmail }, { onConflict: "id" });

    // Add tenant membership
    const { error: mErr } = await admin
      .from("tenant_members")
      .upsert({ tenant_id, user_id: userId, role }, { onConflict: "tenant_id,user_id" });
    if (mErr) return json({ error: mErr.message }, 400);

    return json({ email: normalizedEmail, password, user_id: userId, created });
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
