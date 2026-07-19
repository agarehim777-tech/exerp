import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";

/**
 * DB-based RBAC hook.
 * Reads role_permissions table + current user's role in active tenant.
 * Fails OPEN when no data yet (so legacy in-memory permissions still apply).
 */
export function usePermissions() {
  const { activeMembership, loading: authLoading } = useAuth();
  const role = activeMembership?.role || null;
  const [matrix, setMatrix] = useState(null); // { [module]: { can_view, can_edit } }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!role) { setMatrix(null); setLoading(false); return; }
    setLoading(true);
    supabase
      .from("role_permissions")
      .select("module, can_view, can_edit")
      .eq("role", role)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { setMatrix(null); setLoading(false); return; }
        const m = {};
        for (const r of data) m[r.module] = { view: r.can_view, edit: r.can_edit };
        setMatrix(m);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [role]);

  const can = useCallback((module, action = "view") => {
    if (!matrix) return true; // fail-open until loaded
    const entry = matrix[module];
    if (!entry) return true;
    return action === "edit" ? !!entry.edit : !!entry.view;
  }, [matrix]);

  return useMemo(() => ({
    role,
    matrix,
    loading: loading || authLoading,
    can,
    canView: (m) => can(m, "view"),
    canEdit: (m) => can(m, "edit"),
    isOwner: role === "owner",
    isAdmin: role === "owner" || role === "admin",
    isViewer: role === "viewer",
  }), [role, matrix, loading, authLoading, can]);
}

export function PermissionGate({ module, action = "view", fallback = null, children }) {
  const { can } = usePermissions();
  if (!can(module, action)) return fallback;
  return children;
}
