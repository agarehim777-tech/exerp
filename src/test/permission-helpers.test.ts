import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as permissions from "../shared/lib/permissionHelpers.ts";
import {
  canAccessNavItem,
  getCurrentUser,
  getPageActionPermission,
  hasEffectivePermission,
  hasPageAction,
  hasRolePermission,
  hasUserModuleAccess,
} from "../shared/lib/permissionHelpers.ts";
import { defaultRoles, permissionCatalog } from "../services/permissions.js";

const superAdmin = { users: [{ id: "root", name: "Root", role: "Platform Super Admin", status: "Aktiv" }], sessionUserId: "root" };
// Saved roles are merged onto the default ones (unknown role names are dropped), so use a default role.
const role = defaultRoles.find((item) => item.name !== "Super Admin" && (item.permissions || []).length > 0)!;
const granted = role.permissions[0];
const denied = permissionCatalog.map((item) => item.key).find((key) => !role.permissions.includes(key))!;
const tester = {
  users: [{ id: "t1", name: "Tester", role: role.name, status: "Aktiv" }],
  sessionUserId: "t1",
};
const signedOut = { ...tester, sessionUserId: null };

describe("permission helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, value] of Object.entries(permissions)) {
      if (typeof value !== "function") continue;
      expect((legacy as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it("resolves the session user and denies everything when signed out", () => {
    expect(getCurrentUser(tester)?.id).toBe("t1");
    expect(getCurrentUser(signedOut)).toBeNull();
    expect(hasRolePermission(signedOut, granted)).toBe(false);
    expect(hasUserModuleAccess(signedOut, "sales")).toBe(false);
  });

  it("treats a missing permission or module as allowed", () => {
    expect(hasRolePermission(signedOut, null)).toBe(true);
    expect(hasUserModuleAccess(signedOut, "")).toBe(true);
  });

  it("checks role permissions for normal users", () => {
    expect(hasRolePermission(tester, granted)).toBe(true);
    expect(hasRolePermission(tester, denied)).toBe(false);
    expect(hasEffectivePermission(tester, denied)).toBe(false);
  });

  it("lets the platform super admin through every check", () => {
    expect(hasRolePermission(superAdmin, "anything.at.all")).toBe(true);
    expect(hasUserModuleAccess(superAdmin, "sales")).toBe(true);
    expect(canAccessNavItem(superAdmin, "sales")).toBe(true);
  });

  it("knows which pages have a primary action", () => {
    expect(hasPageAction("messages")).toBe(false);
    expect(getPageActionPermission("no-such-module")).toBeNull();
  });
});
