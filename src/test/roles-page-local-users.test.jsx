import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invites: [] }));
vi.mock("../auth/AuthProvider.jsx", () => ({
  useAuth: () => ({ activeMembership: { tenant_id: "tenant-a", user_id: "me", tenants: { name: "QA" } } }),
}));
vi.mock("../shared/hooks/usePermissions.js", () => ({ usePermissions: () => ({ isAdmin: true, role: "admin" }) }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        then: (resolve) => Promise.resolve({ data: table === "tenant_invites" ? mocks.invites : [], error: null }).then(resolve),
      };
      return chain;
    },
  },
}));
import RolesPermissionsPage from "../modules/settings/RolesPermissionsPage.jsx";

const appUsers = [
  { id: "USR-1", name: "Leyla Anbar", email: "leyla@example.test", role: "Anbardar", status: "Aktiv" },
  { id: "USR-2", name: "Murad Satış", email: "murad@example.test", role: "Satıcı", status: "Aktiv" },
];
const appRoles = [{ name: "Anbardar" }, { name: "Satıcı" }];

beforeEach(() => {
  mocks.invites = [{ id: "inv-1", email: "murad@example.test", role: "member", created_at: "2026-11-03T08:00:00Z" }];
});
afterEach(cleanup);

const rowFor = async (name) => (await screen.findByText(name)).closest("tr");

test("a browser-only profile without an invite is shown as having no account", async () => {
  render(<RolesPermissionsPage appUsers={appUsers} appRoles={appRoles} canManageUsers />);
  expect(within(await rowFor("Leyla Anbar")).getByText("Hesab yoxdur")).toBeTruthy();
  expect(within(await rowFor("Murad Satış")).getByText("Dəvət gözləyir")).toBeTruthy();
});

test("without the account API the create form points to invites instead of creating a local record", async () => {
  const onCreateAppUser = vi.fn();
  render(<RolesPermissionsPage appUsers={appUsers} appRoles={appRoles} canManageUsers onCreateAppUser={onCreateAppUser} />);
  expect((await screen.findByRole("note")).textContent).toContain("Dəvət et");
  expect(screen.getByRole("button", { name: "İstifadəçi yarat" }).disabled).toBe(true);
});

test("with the account API the create form stays available", async () => {
  render(<RolesPermissionsPage appUsers={appUsers} appRoles={appRoles} canManageUsers requiresPassword />);
  await rowFor("Leyla Anbar");
  expect(screen.queryByRole("note")).toBeNull();
  expect(screen.getByRole("button", { name: "İstifadəçi yarat" }).disabled).toBe(false);
});
