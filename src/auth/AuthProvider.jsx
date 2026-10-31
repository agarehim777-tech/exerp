import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase } from "../integrations/supabase/client";
import { logger } from "../lib/logger";
import { setUser as setObsUser } from "../lib/observability";


const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestScope = useRef({ uid: undefined, version: 0 });
  const loadedUid = useRef(null);

  const refresh = useCallback(async (uid) => {
    if (requestScope.current.uid !== uid) return;
    const version = ++requestScope.current.version;
    const isCurrent = () => requestScope.current.version === version && requestScope.current.uid === uid;
    // Only show the blocking loader before the first profile load for this user.
    if (!loadedUid.current || loadedUid.current !== uid) setLoading(true);
    try {
    if (!uid) {
      setProfile(null);
      setMemberships([]);
      setIsPlatformAdmin(false);
      return;
    }
    const results = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("tenant_members").select("id, tenant_id, role, tenants(id,name,slug)").eq("user_id", uid),
      supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
    ]);
    if (!isCurrent()) return;
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    const [{ data: prof }, { data: mem }, { data: pa }] = results;
    setProfile(prof ?? null);
    setMemberships(mem ?? []);
    setIsPlatformAdmin(!!pa);
    loadedUid.current = uid;
    } catch (error) {
      if (!isCurrent()) return;
      // Keep previously loaded profile on background refresh failures.
      if (loadedUid.current !== uid) { setProfile(null); setMemberships([]); setIsPlatformAdmin(false); }
      logger.error('Auth profile refresh failed', { error: error.message });
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);


  useEffect(() => {
    let sessionRevision = 0;
    let disposed = false;
    const adoptSession = (s) => {
      const uid = s?.user?.id;
      const sameUser = Boolean(uid) && loadedUid.current === uid;
      requestScope.current = { uid, version: requestScope.current.version + 1 };
      setSession(s);
      if (!sameUser) {
        // Different user (or sign-out): reset identity and block until reloaded.
        loadedUid.current = null;
        setLoading(true);
        setProfile(null); setMemberships([]); setIsPlatformAdmin(false);
      }
      setObsUser(s?.user ? { id: s.user.id, email: s.user.email } : null);
    };
    // Register listener FIRST, then fetch initial session (recommended pattern)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      sessionRevision++;
      adoptSession(s);
      // Defer supabase calls to avoid deadlock
      setTimeout(() => { if (!disposed) refresh(s?.user?.id); }, 0);
    });

    const initialRevision = sessionRevision;
    supabase.auth.getSession().then(({ data }) => {
      if (disposed || sessionRevision !== initialRevision) return;
      adoptSession(data.session);
      refresh(data.session?.user?.id);
    }).catch((error) => {
      if (disposed || sessionRevision !== initialRevision) return;
      logger.error('Initial auth session failed', { error: error.message });
      setLoading(false);
    });


    return () => {
      disposed = true;
      requestScope.current.version++;
      sub.subscription.unsubscribe();
    };
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
    const { error } = await supabase.auth.signOut();
    if (error) {
      logger.error("signOut failed", { error: error.message });
      throw error;
    }
    loadedUid.current = null;
    setProfile(null);
    setMemberships([]);
    setIsPlatformAdmin(false);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      isPlatformAdmin,
      activeTenantId: profile?.active_tenant_id ?? null,
      activeMembership: memberships.find((m) => m.tenant_id === profile?.active_tenant_id) ?? null,
      loading,
      refresh: () => refresh(session?.user?.id),
      setActiveTenant,
      signOut,
    }),
    [session, profile, memberships, isPlatformAdmin, loading, refresh, setActiveTenant, signOut],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}


export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
