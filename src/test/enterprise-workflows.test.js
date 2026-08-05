import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("enterprise workflow contract", () => {
  it("keeps supported module names stable", async () => {
    const source = await import("../services/enterpriseWorkflows.js?contract");
    expect(source.listWorkflowRecords).toBeTypeOf("function");
    expect(source.saveWorkflowRecord).toBeTypeOf("function");
    expect(source.decideWorkflowStep).toBeTypeOf("function");
    expect(source.listInventoryUnits).toBeTypeOf("function");
    expect(source.queueNotification).toBeTypeOf("function");
    expect(source.listEmployee360).toBeTypeOf("function");
  });

  it("protects platform limit management behind the platform-admin RPC", async () => {
    const migration = await readFile("supabase/migrations/20260805143000_platform_limits_rpc.sql", "utf8");
    expect(migration).toContain("platform_set_tenant_limits");
    expect(migration).toContain("is_platform_admin(auth.uid())");
    expect(migration).toContain("tenant_limits_updated");
    expect(migration).toContain("platform_tenant_usage");
  });
});

