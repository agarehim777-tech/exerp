import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../modules/credits/CreditInitialPayments.jsx", () => ({
  CreditInitialPaymentsHistory: ({ creditId }: { creditId: string }) => <div data-testid="initial-history">{creditId}</div>,
}));

import * as bridge from "../shared/lib/appDomainFinance.jsx";
import { CreditDetailModal, CreditPaymentForm, CreditSchedule } from "../modules/credits/components/CreditDetail.tsx";

const startedItem = {
  credit: {
    id: "CR-1", customer: "Aysel Məmmədova", contractId: "KR-77", device: "iPhone 15", orderId: "O-9", orderNo: "S-1009",
    status: "Aktiv", startedAt: "2026-10-01", paidMonths: 1, initialPaid: 200, requiredInitial: 200,
    payments: [{ date: "2026-11-01", principal: 100, penalty: 5 }], next: "2026-12-01",
  },
  plan: {
    months: 3, monthly: 100, lastPayment: 100, total: 500, balance: 200, initialPayment: 200,
    installments: [{ month: 1, amount: 0, due: "2026-11-01" }, { month: 2, amount: 100, due: "2026-12-01" }, { month: 3, amount: 100, due: "2027-01-01" }],
  },
  paymentState: { isOverdue: false, isDueToday: false, daysOverdue: 0, nextInstallment: { amount: 100, due: "2026-12-01" } },
  progress: 33,
};

function renderModal(item: Record<string, any> = startedItem) {
  const handlers = {
    sendCreditSms: vi.fn(), onUpdatePaymentDate: vi.fn(), onReceivePayment: vi.fn(async () => true), onOpenSalesOrder: vi.fn(), onClose: vi.fn(),
  };
  render(<CreditDetailModal item={item} {...handlers} />);
  return handlers;
}

describe("credit detail components", () => {
  it("are still exported from appDomainFinance.jsx", () => {
    expect(bridge.CreditDetailModal).toBe(CreditDetailModal);
    expect(bridge.CreditPaymentForm).toBe(CreditPaymentForm);
  });

  it("shows a started credit with its contract tiles, history, schedule and actions", () => {
    const handlers = renderModal();
    const dialog = screen.getByRole("dialog", { name: "Kredit müqaviləsi" });
    expect(within(dialog).getByTestId("credit-total-tile")).toHaveTextContent("Müqavilə məbləği");
    expect(within(dialog).getByTestId("credit-paid-tile")).toHaveTextContent("Ödənilib");
    expect(within(dialog).getByTestId("credit-balance-tile")).toHaveTextContent("2 ay qalıb");
    expect(within(dialog).getByText("1 əməliyyat")).toBeInTheDocument();
    expect(within(dialog).getByTestId("initial-history")).toHaveTextContent("CR-1");
    expect(within(dialog).getByLabelText("Əsas məbləğ")).toHaveValue(100);

    fireEvent.click(within(dialog).getByTestId("credit-order-link"));
    expect(handlers.onOpenSalesOrder).toHaveBeenCalledWith("O-9");
    fireEvent.change(within(dialog).getByLabelText("3. ay ödəniş tarixi"), { target: { value: "2027-01-15" } });
    expect(handlers.onUpdatePaymentDate).toHaveBeenCalledWith("CR-1", 3, "2027-01-15");
    // SMS is not connected yet: the reminder button is shown as coming soon and cannot be pressed.
    expect(within(dialog).getByRole("button", { name: "SMS xatırlatma (tezliklə)" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Pəncərəni bağla" }));
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });

  it("hides payment, schedule and SMS controls until the credit is started", () => {
    renderModal({ ...startedItem, credit: { ...startedItem.credit, status: "Başlanmayıb", startedAt: undefined } });
    expect(screen.getByText("Kredit başlanmayıb")).toBeInTheDocument();
    expect(screen.queryByLabelText("Əsas məbləğ")).toBeNull();
    expect(screen.queryByLabelText("2. ay ödəniş tarixi")).toBeNull();
    expect(screen.queryByRole("button", { name: /SMS xatırlatma/ })).toBeNull();
  });

  it("marks closed, current and future schedule months", () => {
    render(<CreditSchedule installments={startedItem.plan.installments} onUpdatePaymentDate={vi.fn()} />);
    const labels = screen.getAllByText(/ay$/, { selector: "em" }).map((node) => node.closest("label"));
    expect(labels.map((label) => label?.className)).toEqual(["closed", "current", ""]);
    expect(labels.map((label) => label?.querySelector("small")?.textContent)).toEqual(["Bağlanıb", "Cari ay", "Gözləyir"]);
  });
});
