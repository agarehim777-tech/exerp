import { CreditCard, FileText, Package, Users, Wallet, X } from "lucide-react";
import { DataTable, EmptyState, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useMemo } from "react";
import { money } from "../../services/format.js";
import { getCreditDisplayPlan, getCreditInitials } from "./credit.js";
import { stages } from "../../data.js";
import { getInstallmentStatus } from "./financeDomain.ts";
// Sales/CRM domain logic (seller bonuses, order filters, Customer 360, CRM pipeline, customer/credit lookups) lives in
// salesDomain.ts; this file keeps the sales UI components and re-exports the moved logic for old imports.
export {
  buildSalesBonusRows,
  getOrderSellerBonuses,
  matchesSalesOrderFilter,
  matchesSalesOrderSearch,
  matchesSalesDateRange,
  getSalesCashImpact,
  getOrderBonusAmount,
  getSalesOrderRiskStatus,
  getOrderBonusText,
  getShortSellerName,
  parseSellerBonusText,
  buildCustomer360,
  buildCrmPipelineRows,
  matchesCrmCustomerSegment,
  matchesCrmCustomerSearch,
  matchesCrmPipelineFilter,
  getCustomerRelatedCredits,
  getCustomerOrders,
  getLatestOrder,
  getCustomerContracts,
  getCreditOrder,
  getCreditContract,
  getOrderProductRows,
  getOrderCredit,
  sortByBusinessDateDesc,
} from "./salesDomain.ts";
import { buildCustomer360 } from "./salesDomain.ts";

export function WorkflowSteps({ activeStage, compact = false }) {
  const activeIndex = stages.indexOf(activeStage);
  return (
    <div className={`workflow-steps ${compact ? "compact" : ""}`}>
      {stages.map((stage, index) => (
        <div
          key={stage}
          className={`workflow-step ${index <= activeIndex ? "done" : ""} ${index === activeIndex ? "current" : ""}`}
        >
          <span>{index + 1}</span>
          <small>{stage}</small>
        </div>
      ))}
    </div>
  );
}

export function CustomerCreditHistory({ credits }) {
  if (credits.length === 0) return "Yoxdur";

  const latest = credits[0];
  const latestPlan = getCreditDisplayPlan(latest);
  const totalBalance = credits.reduce((sum, credit) => sum + getCreditDisplayPlan(credit).balance, 0);

  return (
    <div className="customer-credit-history">
      <strong>
        {credits.length} kredit · {money(totalBalance)} qalıq
      </strong>
      <span>
        {latest.id} · {latestPlan.months} ay · {money(latestPlan.monthly)}/ay
      </span>
    </div>
  );
}

export function Customer360Modal({ customer, credits, orders, contracts, onOpenSalesOrder, onOpenCredit, onClose }) {
  const profile = useMemo(
    () => buildCustomer360(customer, { credits, orders, contracts }),
    [customer, credits, orders, contracts],
  );
  const nextPayment = profile.nextPayment;
  const latestPayments = profile.paymentRows.slice(0, 5);

  return (
    <div className="modal-shell customer-360-modal-shell" role="dialog" aria-modal="true" aria-labelledby="customer-360-title">
      <div className="modal-card customer-360-modal-card">
        <div className="modal-head customer-360-head">
          <div>
            <h2 id="customer-360-title">{customer.name}</h2>
            <p>FİN {customer.fin} üzrə müqavilə, cihaz, ödəniş və təhvil 360 baxışı</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>

        <div className="customer-360-body">
          <section className="customer-360-profile-grid">
            <div className="customer-360-profile-card">
              <span className="customer-360-avatar">{getCreditInitials(customer.name)}</span>
              <div>
                <strong>{customer.name}</strong>
                <span>{customer.category} · FİN {customer.fin}</span>
              </div>
            </div>
            <div className="customer-360-profile-field">
              <span>Telefon</span>
              <strong>{customer.phone || "Qeyd edilməyib"}</strong>
            </div>
            <div className="customer-360-profile-field">
              <span>Kredit limiti</span>
              <strong>{money(customer.limit)}</strong>
            </div>
            <div className="customer-360-profile-field">
              <span>Risk statusu</span>
              <StatusBadge status={profile.overdueCount > 0 || customer.delay > 0 ? "Gecikmə nəzarəti" : "Sağlam"} />
            </div>
          </section>

          <section className="customer-360-summary">
            <div>
              <span>Müqavilə məbləği</span>
              <strong>{money(profile.totalPurchased)}</strong>
            </div>
            <div>
              <span>Ödənilib</span>
              <strong>{money(profile.totalPaid)}</strong>
            </div>
            <div>
              <span>Qalıq</span>
              <strong>{money(profile.totalBalance)}</strong>
            </div>
            <div>
              <span>Aktiv kredit</span>
              <strong>{profile.activeCreditCount}</strong>
            </div>
            <div>
              <span>Gecikmə</span>
              <strong>{profile.overdueCount}</strong>
            </div>
          </section>

          <section className="customer-360-grid">
            <div className="customer-360-main">
              <Panel className="customer-360-section">
                <PanelHeader title="Kredit və satış müqavilələri" subtitle="Hər satış ayrı borc kimi saxlanılır" icon={FileText} />
                <div className="customer-360-contract-list">
                  {profile.agreements.length === 0 ? (
                    <EmptyState title="Müştəri üzrə müqavilə yoxdur" />
                  ) : (
                    profile.agreements.map((agreement) => (
                      <article
                        className={`customer-360-contract-card${agreement.paymentState?.isOverdue ? " is-overdue" : ""}`}
                        key={agreement.key}
                      >
                        <div className="customer-360-contract-head">
                          <div>
                            <span>{agreement.type}</span>
                            <h3>{agreement.contractId}</h3>
                            <p>{agreement.product}</p>
                          </div>
                          <StatusBadge status={agreement.status} />
                        </div>
                        <div className="customer-360-contract-meta">
                          <span>
                            Sifariş
                            {agreement.orderId && agreement.orderId !== "—" ? (
                              <button
                                className="module-link-btn"
                                type="button"
                                onClick={() => onOpenSalesOrder?.(agreement.orderId)}
                                data-testid="crm-360-order-link"
                              >
                                {agreement.orderId}
                              </button>
                            ) : (
                              <strong>—</strong>
                            )}
                          </span>
                          <span>
                            Kredit
                            {agreement.creditId && agreement.creditId !== "—" ? (
                              <button
                                className="module-link-btn"
                                type="button"
                                onClick={() => onOpenCredit?.(agreement.creditId)}
                                data-testid="crm-360-credit-link"
                              >
                                {agreement.creditId}
                              </button>
                            ) : (
                              <strong>—</strong>
                            )}
                          </span>
                          <span>Tarix <strong>{agreement.date || "—"}</strong></span>
                          <span>Mənbə <strong>{agreement.source}</strong></span>
                        </div>
                        <div className="customer-360-contract-values">
                          <div>
                            <span>Müqavilə</span>
                            <strong>{money(agreement.amount)}</strong>
                          </div>
                          <div>
                            <span>İlkin / ödənilib</span>
                            <strong>{money(agreement.initialPayment)} / {money(agreement.paid)}</strong>
                          </div>
                          <div>
                            <span>Qalıq</span>
                            <strong>{money(agreement.balance)}</strong>
                          </div>
                          <div>
                            <span>Növbəti</span>
                            <strong>{agreement.monthly > 0 ? `${money(agreement.monthly)} · ${agreement.nextDue}` : "—"}</strong>
                          </div>
                        </div>
                        {agreement.plan ? (
                          <details className="customer-360-schedule-preview">
                            <summary>Ödəniş cədvəli · {agreement.paidMonths}/{agreement.months} ay · {agreement.remainingMonths} qalıb</summary>
                            <div className="customer-360-schedule-scroll">
                              {agreement.plan.installments.map((installment) => (
                                <div className="customer-360-schedule-row" key={`${agreement.id}-${installment.month}`}>
                                  <span>{installment.month}. ay</span>
                                  <strong>{money(installment.amount)}</strong>
                                  <em>{installment.due}</em>
                                  <StatusBadge status={getInstallmentStatus(installment)} />
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <div className="customer-360-direct-note">
                            <span>Satış balansı</span>
                            <strong>{agreement.balance > 0 ? `${money(agreement.balance)} qalıq` : "Tam ödənilib"}</strong>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Alınan cihazlar" subtitle="Hər cihaz üzrə ödənilən və qalan məbləğ" icon={Package} />
                <DataTable
                  columns={["Cihaz", "Müqavilə", "Sifariş", "Məbləğ", "Ödənilib", "Qalıq", "Status"]}
                  rows={profile.devices.map((device) => [
                    <TwoLine title={device.product} subtitle={`${device.qty} ədəd${device.serials.length ? ` · ${device.serials.join(", ")}` : ""}`} />,
                    device.contractId,
                    device.orderId,
                    money(device.amount),
                    money(device.paid),
                    <strong>{money(device.balance)}</strong>,
                    <StatusBadge status={device.status || "Aktiv"} />,
                  ])}
                />
              </Panel>
            </div>

            <aside className="customer-360-side">
              <Panel className="customer-360-section">
                <PanelHeader title="Yığım və risk" subtitle="Növbəti ödəniş, gecikmə və təhvil nəzarəti" icon={CreditCard} />
                <div className="customer-360-risk-list">
                  <div>
                    <span>Növbəti ödəniş</span>
                    <strong>{nextPayment ? `${money(nextPayment.monthly)} · ${nextPayment.nextDue}` : "Yoxdur"}</strong>
                  </div>
                  <div>
                    <span>Gecikən müqavilə</span>
                    <strong>{profile.overdueCount}</strong>
                  </div>
                  <div>
                    <span>Açıq təhvil</span>
                    <strong>{profile.openOrders}</strong>
                  </div>
                  <div>
                    <span>Ümumi qalıq</span>
                    <strong>{money(profile.totalBalance + Number(customer.debt || 0))}</strong>
                  </div>
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Son ödənişlər" subtitle="Əsas məbləğ və gecikmə gəliri ayrı göstərilir" icon={Wallet} />
                <div className="customer-360-payment-feed">
                  {latestPayments.length === 0 ? (
                    <EmptyState title="Ödəniş tarixçəsi yoxdur" />
                  ) : (
                    latestPayments.map((payment, index) => (
                      <div className="customer-360-payment-row" key={`${payment.creditId}-${payment.date}-${index}`}>
                        <div>
                          <strong>{payment.contractId || payment.creditId}</strong>
                          <span>{payment.product}</span>
                        </div>
                        <div>
                          <strong>{money(Number(payment.principal || 0) + Number(payment.penalty || 0))}</strong>
                          <span>Əsas {money(payment.principal)} · Gecikmə {money(payment.penalty)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Müştəri əlaqəsi" subtitle="Satış və yığım komandası üçün sürətli dosye" icon={Users} />
                <div className="customer-360-contact-card">
                  <div>
                    <span>FİN</span>
                    <strong>{customer.fin}</strong>
                  </div>
                  <div>
                    <span>Telefon</span>
                    <strong>{customer.phone || "—"}</strong>
                  </div>
                  <div>
                    <span>Kateqoriya</span>
                    <strong>{customer.category}</strong>
                  </div>
                  <div>
                    <span>Müqavilə sayı</span>
                    <strong>{profile.agreements.length}</strong>
                  </div>
                </div>
              </Panel>
            </aside>
          </section>
        </div>
      </div>
    </div>
  );
}

