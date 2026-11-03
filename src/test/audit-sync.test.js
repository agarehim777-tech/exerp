import { describe, expect, it } from "vitest";
import { pendingAuditEventRows } from "../services/auditSync.js";
import { buildProductionHardeningReport } from "../shared/lib/appHelpers.jsx";

const ctx = { tenantId: "tenant-a", actorId: "user-1", fallbackRole: "Admin", since: "2026-11-03T08:00:00.000Z" };
const entry = (id, date, extra = {}) => ({ id, date, module: "Satış", action: "Sifariş", detail: id, ...extra });

describe("pendingAuditEventRows", () => {
  it("sends every unsynced entry, not only the newest one", () => {
    const log = [entry("AUD-3", "2026-11-03T08:03:00.000Z"), entry("AUD-2", "2026-11-03T08:02:00.000Z"), entry("AUD-1", "2026-11-03T08:01:00.000Z")];
    const rows = pendingAuditEventRows(log, new Set(["AUD-3"]), ctx);
    expect(rows.map((row) => row.id)).toEqual(["AUD-2", "AUD-1"]);
    expect(rows[0]).toMatchObject({ tenant_id: "tenant-a", actor_id: "user-1", actor_role: "Admin", module: "Satış", occurred_at: "2026-11-03T08:02:00.000Z" });
  });

  it("does not send entries loaded with the shared snapshot from before this session", () => {
    const log = [entry("AUD-new", "2026-11-03T08:05:00.000Z"), entry("AUD-other-user", "2026-11-02T17:00:00.000Z")];
    expect(pendingAuditEventRows(log, new Set(), ctx).map((row) => row.id)).toEqual(["AUD-new"]);
  });

  it("sends nothing without a tenant or a signed-in user", () => {
    const log = [entry("AUD-1", "2026-11-03T08:01:00.000Z")];
    expect(pendingAuditEventRows(log, new Set(), { ...ctx, tenantId: "" })).toEqual([]);
    expect(pendingAuditEventRows(log, new Set(), { ...ctx, actorId: undefined })).toEqual([]);
  });
});

describe("production hardening audit readiness", () => {
  const backend = (report) => report.items.find((item) => item.area === "Backend sərtləşdirmə");

  it("does not count a browser-only audit trail as immutable", () => {
    const snapshot = { auditLog: [entry("AUD-1", "2026-11-03T08:01:00.000Z")], dbMeta: { runtime: "server", provider: "supabase" } };
    expect(backend(buildProductionHardeningReport(snapshot)).status).toBe("Nəzarət");
    expect(backend(buildProductionHardeningReport(snapshot, { auditServerSynced: true })).status).toBe("Hazır");
  });
});
