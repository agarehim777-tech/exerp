import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { permissionForScreen } from '../../config/permissionModules.js';

// A dropped or timed-out read must not leave the user without navigation until a reload,
// so failed loads stay closed (loading, nothing allowed) and are retried with backoff.
export const PERMISSION_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

/**
 * DB-based RBAC hook.
 * Reads role_permissions table + current user's role in active tenant.
 * Fails closed while permissions are loading or unavailable.
 */
export function usePermissions() {
  const { activeMembership, isPlatformAdmin, loading: authLoading } = useAuth();
  const role = activeMembership?.role || null;
  const [matrix, setMatrix] = useState(null); // { [module]: { can_view, can_edit } }
  const [loading, setLoading] = useState(true);
  const [loadedRole, setLoadedRole] = useState(null);
  const permissionsLoading = loading || authLoading || loadedRole !== role;

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    if (!role) { setMatrix(null); setLoadedRole(null); setLoading(false); return; }
    setLoading(true);
    const load = async (attempt) => {
      let result;
      try {
        result = await supabase
          .from("role_permissions")
          .select("module, can_view, can_edit")
          .eq("role", role);
      } catch (error) {
        result = { data: null, error };
      }
      if (cancelled) return;
      const { data, error } = result;
      if (error || !data) {
        if (attempt < PERMISSION_RETRY_DELAYS_MS.length) {
          retryTimer = setTimeout(() => load(attempt + 1), PERMISSION_RETRY_DELAYS_MS[attempt]);
          return;
        }
        setMatrix(null); setLoadedRole(role); setLoading(false); return;
      }
      const m = {};
      for (const r of data) m[r.module] = { view: r.can_view, edit: r.can_edit };
      setMatrix(m);
      setLoadedRole(role);
      setLoading(false);
    };
    load(0);
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [role]);

  const can = useCallback((module, action = "view") => {
    if (isPlatformAdmin) return true;
    if (permissionsLoading || !role || !matrix) return false;
    const entry = permissionForScreen(matrix, module);
    if (!entry) return false;
    return action === "edit" ? !!entry.edit : !!entry.view;
  }, [matrix, role, permissionsLoading, isPlatformAdmin]);

  return useMemo(() => ({
    role,
    matrix,
    loading: permissionsLoading,
    can,
    canView: (m) => can(m, "view"),
    canEdit: (m) => can(m, "edit"),
    isOwner: role === "owner",
    isAdmin: role === "owner" || role === "admin",
    isViewer: role === "viewer",
  }), [role, matrix, permissionsLoading, can]);
}

export function PermissionGate({ module, action = "view", fallback = null, children }) {
  const { can } = usePermissions();
  if (!can(module, action)) return fallback;
  return children;
}
