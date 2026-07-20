import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
import { logger } from "../lib/logger";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null);
      setMemberships([]);
      setIsPlatformAdmin(false);
      return;
    }
    const [{ data: prof }, { data: mem }, { data: pa }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("tenant_members").select("id, tenant_id, role, tenants(id,name,slug)").eq("user_id", uid),
      supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile(prof ?? null);
    setMemberships(mem ?? []);
    setIsPlatformAdmin(!!pa);
  }, []);


  useEffect(() => {
    // Register listener FIRST, then fetch initial session (recommended pattern)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer supabase calls to avoid deadlock
      setTimeout(() => refresh(s?.user?.id), 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      refresh(data.session?.user?.id).finally(() => setLoading(false));
    });

    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const setActiveTenant = useCallback(
    async (tenantId) => {
      if (!session?.user?.id) return;
      const { error } = await supabase
        .from("profiles")
        .update({ active_tenant_id: tenantId })
        .eq("id", session.user.id);
      if (error) {
        logger.error("setActiveTenant failed", { error: error.message });
        throw error;
      }
      await refresh(session.user.id);
    },
    [session, refresh],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setMemberships([]);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      activeTenantId: profile?.active_tenant_id ?? null,
      activeMembership: memberships.find((m) => m.tenant_id === profile?.active_tenant_id) ?? null,
      loading,
      refresh: () => refresh(session?.user?.id),
      setActiveTenant,
      signOut,
    }),
    [session, profile, memberships, loading, refresh, setActiveTenant, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
