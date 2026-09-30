import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: {}, pending: [] }));
vi.mock("../auth/AuthProvider.jsx", () => ({ useAuth: () => mocks.auth }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => new Promise((resolve) => mocks.pending.push(resolve)) }) }),
  },
}));
import { usePermissions } from "../shared/hooks/usePermissions.js";

beforeEach(() => {
  mocks.auth = { activeMembership: null, isPlatformAdmin: false, loading: false };
  mocks.pending = [];
});
afterEach(cleanup);

test("a newly available role stays loading on every render until its matrix arrives", async () => {
  const renders = [];
  const { result, rerender } = renderHook(() => {
    const permissions = usePermissions();
    renders.push({ role: permissions.role, loading: permissions.loading, allowed: permissions.can("cashbook") });
    return permissions;
  });
  expect(result.current.loading).toBe(false);
  mocks.auth.activeMembership = { role: "admin" };
  rerender();
  expect(renders.filter((row) => row.role === "admin").every((row) => row.loading && !row.allowed)).toBe(true);
  await act(async () => mocks.pending.shift()({ data: [{ module: "cashbook", can_view: true, can_edit: true }], error: null }));
  expect(result.current.loading).toBe(false);
  expect(result.current.can("cashbook")).toBe(true);
});

test("changing roles never reuses the previous role's permissions", async () => {
  mocks.auth.activeMembership = { role: "admin" };
  const renders = [];
  const { result, rerender } = renderHook(() => {
    const permissions = usePermissions();
    renders.push({ role: permissions.role, loading: permissions.loading, allowed: permissions.can("cashbook", "edit") });
    return permissions;
  });
  await act(async () => mocks.pending.shift()({ data: [{ module: "cashbook", can_view: true, can_edit: true }], error: null }));
  expect(result.current.can("cashbook", "edit")).toBe(true);
  mocks.auth.activeMembership = { role: "viewer" };
  rerender();
  expect(renders.filter((row) => row.role === "viewer").every((row) => row.loading && !row.allowed)).toBe(true);
  await act(async () => mocks.pending.shift()({ data: [{ module: "cashbook", can_view: true, can_edit: false }], error: null }));
  expect(result.current.loading).toBe(false);
  expect(result.current.can("cashbook", "edit")).toBe(false);
});
