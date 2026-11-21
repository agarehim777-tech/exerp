import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
vi.mock("../services/enterpriseWorkflows.js", () => ({ listWorkflowRecords: mocks.list, saveWorkflowRecord: mocks.save }));

import { useRfqActions } from "../modules/procurement/useRfqActions.ts";
import { emptyPoLine, emptyRfq } from "../modules/procurement/procurementShared.jsx";

function setup({ tenantId = "tenant-a", current = (): boolean => true }: { tenantId?: string; current?: () => boolean } = {}) {
  const deps = {
    tenantId,
    begin: vi.fn(() => current),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSaving: vi.fn(),
    setPoForm: vi.fn(),
    setPoDraftLines: vi.fn(),
    setTab: vi.fn(),
  };
  return { ...deps, view: renderHook(() => useRfqActions(deps)) };
}
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as import("react").FormEvent;

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([{ id: "R1", record_no: "RFQ-1" }]);
  mocks.save.mockReset().mockResolvedValue({});
});

describe("useRfqActions", () => {
  it("loads the tenant's RFQs on mount in the rfq request lane", async () => {
    const { view, begin } = setup();
    await waitFor(() => expect(view.result.current.rfqs).toEqual([{ id: "R1", record_no: "RFQ-1" }]));
    expect(mocks.list).toHaveBeenCalledWith({ tenantId: "tenant-a", module: "procurement", recordType: "rfq" });
    expect(begin).toHaveBeenCalledWith("rfq");
  });

  it("skips loading without a tenant and drops a stale response", async () => {
    setup({ tenantId: "" });
    expect(mocks.list).not.toHaveBeenCalled();
    const stale = setup({ current: () => false });
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(stale.view.result.current.rfqs).toEqual([]);
  });

  it("validates the form before creating an RFQ", async () => {
    const { view, setError } = setup();
    await act(() => view.result.current.saveRfq(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("RFQ adı, məhsul, miqdar və ən azı bir təchizatçı tələb olunur.");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("creates an RFQ with both approvals, resets the form and reloads", async () => {
    const { view, setNotice, setSaving } = setup();
    act(() => view.result.current.setRfqForm({ ...emptyRfq, title: " Noutbuklar ", description: " Laptop ", quantity: "3", vendor_ids: ["V1"], due_at: "2026-12-01" }));
    await act(() => view.result.current.saveRfq(submitEvent()));
    const saved = mocks.save.mock.calls[0][0];
    expect(saved).toMatchObject({
      tenantId: "tenant-a", module: "procurement",
      record: { record_type: "rfq", status: "sent", title: "Noutbuklar", due_at: "2026-12-01T18:00:00", payload: { vendor_ids: ["V1"], selected_vendor_id: null, bids: [] } },
      lines: [{ description: "Laptop", quantity: 3, unit_price: 0 }],
      approvals: [{ role_code: "procurement_manager" }, { role_code: "finance_manager" }],
    });
    expect(saved.record.record_no).toMatch(/^RFQ/);
    expect(view.result.current.rfqForm).toEqual(emptyRfq);
    expect(setNotice).toHaveBeenLastCalledWith("Təklif sorğusu yaradıldı və təchizatçı müqayisəsinə göndərildi.");
    expect(setSaving.mock.calls).toEqual([[true], [false]]);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("updates an RFQ without its joined lines and approvals", async () => {
    const { view, setNotice } = setup();
    await act(() => view.result.current.updateRfq({ id: "R1", status: "sent", workflow_lines: [{}], workflow_approvals: [{}] }, { status: "closed" }));
    expect(mocks.save).toHaveBeenCalledWith({ tenantId: "tenant-a", module: "procurement", record: { id: "R1", status: "closed" } });
    expect(setNotice).toHaveBeenLastCalledWith("RFQ statusu yeniləndi.");
  });

  it("reports a save error", async () => {
    mocks.save.mockRejectedValueOnce(new Error("RFQ yazılmadı"));
    const { view, setError } = setup();
    await act(() => view.result.current.updateRfq({ id: "R1" }, { status: "closed" }));
    expect(setError).toHaveBeenLastCalledWith("RFQ yazılmadı");
  });

  it("turns an RFQ into a PO draft for the selected vendor", () => {
    const { view, setPoForm, setPoDraftLines, setTab } = setup();
    act(() => view.result.current.convertRfqToPo({
      record_no: "RFQ-7", title: "Noutbuklar",
      payload: { vendor_ids: ["V1", "V2"], selected_vendor_id: "V2" },
      workflow_lines: [{ description: "Laptop", quantity: 4 }],
    }));
    expect(setPoForm.mock.calls[0][0]).toMatchObject({ vendor_id: "V2", notes: "RFQ: RFQ-7" });
    expect(setPoDraftLines).toHaveBeenCalledWith([{ ...emptyPoLine, description: "Laptop", qty_ordered: "4" }]);
    expect(setTab).toHaveBeenCalledWith("po");
  });
});
