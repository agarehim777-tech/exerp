import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ results: {}, reads: [] }));
vi.mock("../auth/AuthProvider.jsx", () => ({
  useAuth: () => ({ activeMembership: { tenant_id: "tenant-a", user_id: "me", tenants: { name: "QA" } } }),
}));
vi.mock("../shared/hooks/usePermissions.js", () => ({ usePermissions: () => ({ isAdmin: true, role: "admin" }) }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: (table) => {
      mocks.reads.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        then: (resolve) => Promise.resolve(mocks.results[table]?.() ?? { data: [], error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
import RolesPermissionsPage from "../modules/settings/RolesPermissionsPage.jsx";

const member = { id: "m1", user_id: "u1", role: "member", profiles: { email: "anar@example.test", full_name: "Anar QA" } };

beforeEach(() => {
  mocks.reads = [];
  mocks.results = {
    role_permissions: () => ({ data: [{ role: "admin", module: "stock", can_view: true, can_edit: false }], error: null }),
    tenant_members: () => ({ data: [member], error: null }),
    tenant_invites: () => ({ data: [], error: null }),
  };
});
afterEach(cleanup);

const permissionBoxes = () => screen.getAllByRole("checkbox");

test("a failed member read is reported instead of showing an empty company", async () => {
  mocks.results.tenant_members = () => ({ data: null, error: { message: "permission denied for table tenant_members" } });
  render(<RolesPermissionsPage />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Yüklənmədi: üzvlər");
  expect(alert.textContent).toContain("permission denied for table tenant_members");
  // The permission matrix did load, so it stays usable.
  expect(permissionBoxes().some((box) => !box.disabled)).toBe(true);
});

test("permission toggles stay off until the matrix has loaded, and retry recovers", async () => {
  mocks.results.role_permissions = () => ({ data: null, error: { message: "fetch failed" } });
  render(<RolesPermissionsPage />);
  expect((await screen.findByRole("alert")).textContent).toContain("icazə matrisi");
  expect(permissionBoxes().every((box) => box.disabled)).toBe(true);

  mocks.results.role_permissions = () => ({ data: [{ role: "admin", module: "stock", can_view: true, can_edit: false }], error: null });
  fireEvent.click(screen.getByRole("button", { name: "Yenidən yüklə" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(permissionBoxes().some((box) => !box.disabled)).toBe(true);
  expect(screen.getByText("Anar QA")).toBeTruthy();
});

test("a thrown read ends loading with an error instead of spinning forever", async () => {
  mocks.results.tenant_invites = () => { throw new Error("network down"); };
  render(<RolesPermissionsPage />);
  expect((await screen.findByRole("alert")).textContent).toContain("network down");
  expect(screen.queryByText("Yüklənir…")).toBeNull();
});
