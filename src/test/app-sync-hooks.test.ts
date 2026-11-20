import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
vi.mock("../integrations/supabase/client", () => ({
  supabase: { from: () => ({ upsert }) },
}));

import { useAuditServerSync } from "../shared/hooks/useAuditServerSync.ts";
import { getCreateAudit } from "../shared/lib/createAudit.ts";

afterEach(() => upsert.mockReset());

describe("audit server sync", () => {
  const props = (auditLog: Record<string, unknown>[]) => ({
    activeRoleInfo: { name: "Admin" },
    activeTenantId: "T1",
    authUser: { id: "U1" },
    state: { auditLog },
  });
  const later = () => new Date(Date.now() + 60_000).toISOString();

  it("sends new entries once and reports when the server accepted them", async () => {
    upsert.mockResolvedValue({ error: null });
    const entry = { id: "A1", module: "CRM", action: "Müştəri yaradıldı", date: later() };
    const { result, rerender } = renderHook((p) => useAuditServerSync(p), { initialProps: props([entry]) });
    await waitFor(() => expect(result.current).not.toBe(""));
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ id: "A1", tenant_id: "T1", actor_id: "U1" })], { onConflict: "id", ignoreDuplicates: true });

    rerender(props([entry]));
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("sends a failed entry again with the next change", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    upsert.mockResolvedValueOnce({ error: { code: "500", message: "down" } }).mockResolvedValue({ error: null });
    const first = { id: "A1", date: later() };
    const { rerender } = renderHook((p) => useAuditServerSync(p), { initialProps: props([first]) });
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    rerender(props([first, { id: "A2", date: later() }]));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    expect(upsert.mock.calls[1][0].map((row: { id: string }) => row.id)).toEqual(["A1", "A2"]);
  });

  it("sends nothing without a signed-in tenant user", () => {
    renderHook(() => useAuditServerSync({ ...props([{ id: "A1", date: later() }]), authUser: null }));
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("create audit labels", () => {
  it("labels a credit sale and falls back for unknown types", () => {
    expect(getCreateAudit("sales", { paymentMethod: "Kredit", customer: "Aysel", orderTotal: 100 }))
      .toMatchObject({ module: "Satış", action: "Kredit satış yaradıldı" });
    expect(getCreateAudit("unknown", {})).toEqual({ module: "Sistem", action: "Qeyd yaradıldı", detail: "unknown" });
  });
});
