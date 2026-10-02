import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { permissionForScreen } from '../../config/permissionModules.js';

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
    if (!role) { setMatrix(null); setLoadedRole(null); setLoading(false); return; }
    setLoading(true);
    supabase
      .from("role_permissions")
      .select("module, can_view, can_edit")
      .eq("role", role)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { setMatrix(null); setLoadedRole(role); setLoading(false); return; }
        const m = {};
        for (const r of data) m[r.module] = { view: r.can_view, edit: r.can_edit };
        setMatrix(m);
        setLoadedRole(role);
        setLoading(false);
      });
    return () => { cancelled = true; };
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
