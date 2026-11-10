import { getOrderPaymentMethod, summarizeOrderProducts, getOrderBalance, normalizeOrderProductLines, getDeliveryAgeDays } from "../../modules/warehouse/deliveryDomain.jsx";
import { CreditCard, FileText, Package, Users, Wallet, X } from "lucide-react";
import { DataTable, EmptyState, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useMemo } from "react";
import { money, normalize } from "../../services/format.js";
import { currentBusinessDate } from "./businessDate";
import { parsePaymentDate } from "../../services/date.js";
import { getCreditDisplayPlan, getCreditInitials, getCreditManagementStatus, getCreditPaidTotal, getCreditPaymentState, getCreditSourceLabel, isCreditClosed } from "./credit.js";
import { stages } from "../../data.js";
import { baseCreditDate, getInstallmentStatus } from "./appDomainFinance.jsx";

export function buildSalesBonusRows(orders) {
  return orders.flatMap((order) => {
    const paid = Number(order.paid || 0);
    const lines = normalizeOrderProductLines(order.productLines || []);
    return getOrderSellerBonuses(order).map((sellerBonus) => {
      const rate = Number(sellerBonus.bonus || 0);
      return {
        id: `${order.id}-${sellerBonus.seller}-${rate}`,
        orderId: order.id,
        date: order.date,
        customer: order.customer,
        product: summarizeOrderProducts(order),
        productLines: lines,
        paymentMethod: order.paymentMethod || "Nağd",
        seller: sellerBonus.seller,
        rate,
        paid,
        bonusAmount: Math.round((paid * rate) / 100),
        status: order.status,
      };
    });
  });
}

export function getOrderSellerBonuses(order) {
  if (Array.isArray(order.sellerBonuses) && order.sellerBonuses.length > 0) {
    return order.sellerBonuses;
  }
  return parseSellerBonusText(order.seller);
}

export function matchesSalesOrderFilter(order, filter) {
  if (filter === "Kredit") return getOrderPaymentMethod(order) === "Kredit";
  if (filter === "Nağd") return getOrderPaymentMethod(order) === "Nağd";
  if (filter === "Qalıqlı") return getOrderBalance(order) > 0;
  if (filter === "Təhvil gözləyən") return order.status !== "Təhvil verilib";
  if (filter === "Tamamlanan") return order.status === "Təhvil verilib";
  if (filter === "Riskli") return getOrderBalance(order) > 0 || (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3);
  return true;
}

export function matchesSalesOrderSearch(order, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  return normalize(
    [
      order.id,
      order.customer,
      order.fin,
      order.phone,
      order.products,
      summarizeOrderProducts(order),
      order.paymentMethod,
      order.paymentStatus,
      order.status,
      order.warehouseName,
      order.creditId,
      order.contractId,
      getOrderSellerBonuses(order).map((seller) => seller.seller).join(" "),
    ].join(" "),
  ).includes(q);
}

export function matchesSalesDateRange(order, dateFrom, dateTo) {
  const orderDate = parsePaymentDate(order.date);
  if (!orderDate) return !dateFrom && !dateTo;
  const from = dateFrom ? parsePaymentDate(dateFrom) : null;
  const to = dateTo ? parsePaymentDate(dateTo) : null;
  if (from && orderDate < from) return false;
  if (to && orderDate > to) return false;
  return true;
}

export function getSalesCashImpact(order) {
  return Math.max(0, Number(order.paid || 0));
}

export function getOrderBonusAmount(order) {
  const paid = Number(order.paid || 0);
  return Math.round(
    getOrderSellerBonuses(order).reduce((sum, sellerBonus) => sum + (paid * Number(sellerBonus.bonus || 0)) / 100, 0),
  );
}

export function getSalesOrderRiskStatus(order) {
  if (order.status === "Təhvil verilib" && getOrderBalance(order) <= 0) return "Tamamlanıb";
  if (getOrderBalance(order) > 0 && order.status !== "Təhvil verilib") return "Borclu + təhvil";
  if (getOrderBalance(order) > 0) return "Borclu";
  if (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3) return "Təhvil riski";
  if (order.status !== "Təhvil verilib") return "Təhvil gözləyir";
  return "Sağlam";
}

export function getOrderBonusText(order) {
  const bonuses = getOrderSellerBonuses(order);
  if (bonuses.length === 0) return "Bonus yoxdur";
  return bonuses.map((item) => `${getShortSellerName(item.seller)} ${Number(item.bonus || 0)}%`).join(", ");
}

export function getShortSellerName(name) {
  return String(name || "")
    .trim()
    .split(" ")[0];
}

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

export function parseSellerBonusText(text) {
  return String(text || "")
    .split(",")
    .map((part) => {
      const match = part.trim().match(/(.+?)\s+(\d+(?:\.\d+)?)%/);
      if (!match) return null;
      return {
        seller: match[1].trim(),
        bonus: Number(match[2] || 0),
      };
    })
    .filter(Boolean);
}

export function buildCustomer360(customer, { credits = [], orders = [], contracts = [] }) {
  const customerOrders = getCustomerOrders(customer, orders);
  const customerCredits = getCustomerRelatedCredits(customer, credits);
  const customerContracts = getCustomerContracts(customer, contracts);
  const contractByOrderId = new Map(customerContracts.filter((contract) => contract.orderId).map((contract) => [contract.orderId, contract]));
  const contractById = new Map(customerContracts.map((contract) => [contract.id, contract]));
  const orderById = new Map(customerOrders.map((order) => [order.id, order]));

  const creditAgreements = customerCredits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    const paymentState = getCreditPaymentState(credit, plan);
    const order = getCreditOrder(credit, customerOrders);
    const contract = getCreditContract(credit, customerContracts);
    const productLines =
      order
        ? getOrderProductRows(order)
        : [
            {
              product: credit.device || credit.product || contract?.product || "Cihaz qeyd edilməyib",
              qty: 1,
              amount: Number(plan.total || contract?.amount || 0),
              serials: [],
            },
          ];
    const paid = getCreditPaidTotal(plan);

    return {
      id: credit.id,
      key: `credit-${credit.id}`,
      type: "Kredit müqaviləsi",
      source: getCreditSourceLabel(credit),
      contractId: credit.contractId || contract?.id || "Müqaviləsiz",
      orderId: credit.orderId || order?.id || contract?.orderId || "—",
      creditId: credit.id,
      date: credit.date || order?.date || contract?.date || baseCreditDate,
      product: productLines.map((line) => line.product).filter(Boolean).join(", "),
      productLines,
      amount: Number(plan.total || contract?.amount || order?.amount || 0),
      paid,
      balance: Number(plan.balance || 0),
      initialPayment: Number(plan.initialPayment || 0),
      monthly: Number(paymentState.nextInstallment?.amount || plan.monthly || 0),
      months: Number(plan.months || 0),
      paidMonths: Number(credit.paidMonths || 0),
      remainingMonths: plan.installments.filter((installment) => Number(installment.amount || 0) > 0).length,
      nextDue: paymentState.nextInstallment?.due || credit.next || "—",
      status: getCreditManagementStatus({ credit, plan, paymentState }),
      overdueDays: Number(paymentState.daysOverdue || 0),
      plan,
      paymentState,
      payments: credit.payments || [],
      order,
      contract,
    };
  });

  const creditedOrderIds = new Set(creditAgreements.map((agreement) => agreement.orderId).filter((id) => id && id !== "—"));
  const usedContractIds = new Set(
    creditAgreements.map((agreement) => agreement.contractId).filter((id) => id && id !== "Müqaviləsiz"),
  );
  const directSaleAgreements = customerOrders
    .filter((order) => !creditedOrderIds.has(order.id) && !getOrderCredit(order, customerCredits))
    .map((order) => {
      const contract = contractByOrderId.get(order.id) || contractById.get(order.contractId);
      if (contract?.id) usedContractIds.add(contract.id);
      const balance = getOrderBalance(order);
      const amount = Number(order.amount || 0);

      return {
        id: order.id,
        key: `order-${order.id}`,
        type: getOrderPaymentMethod(order),
        source: "Satış modulu",
        contractId: order.contractId || contract?.id || "Müqaviləsiz",
        orderId: order.id,
        creditId: "—",
        date: order.date || currentBusinessDate,
        product: summarizeOrderProducts(order),
        productLines: getOrderProductRows(order),
        amount,
        paid: Math.max(0, amount - balance),
        balance,
        initialPayment: Number(order.paid || 0),
        monthly: 0,
        months: 0,
        paidMonths: balance > 0 ? 0 : 1,
        remainingMonths: balance > 0 ? 1 : 0,
        nextDue: balance > 0 ? order.dueDate || "Razılaşdırılmayıb" : "—",
        status: balance > 0 ? "Qalıqlı satış" : "Ödənilib",
        overdueDays: 0,
        plan: null,
        paymentState: null,
        payments: [],
        order,
        contract,
      };
    });

  const standaloneContracts = customerContracts
    .filter((contract) => !usedContractIds.has(contract.id) && !orderById.has(contract.orderId))
    .map((contract) => ({
      id: contract.id,
      key: `contract-${contract.id}`,
      type: "Müqavilə",
      source: "Müqavilə modulu",
      contractId: contract.id,
      orderId: contract.orderId || "—",
      creditId: "—",
      date: contract.date || currentBusinessDate,
      product: contract.product || "Cihaz qeyd edilməyib",
      productLines: [{ product: contract.product || "Cihaz qeyd edilməyib", qty: 1, amount: Number(contract.amount || 0), serials: [] }],
      amount: Number(contract.amount || 0),
      paid: 0,
      balance: Number(contract.amount || 0),
      initialPayment: 0,
      monthly: 0,
      months: 0,
      paidMonths: 0,
      remainingMonths: 0,
      nextDue: "—",
      status: contract.status || "Hazırlanır",
      overdueDays: 0,
      plan: null,
      paymentState: null,
      payments: [],
      order: null,
      contract,
    }));

  const agreements = [...creditAgreements, ...directSaleAgreements, ...standaloneContracts].sort(sortByBusinessDateDesc);
  const paymentRows = customerCredits
    .flatMap((credit) =>
      (credit.payments || []).map((payment) => ({
        ...payment,
        creditId: credit.id,
        contractId: credit.contractId,
        product: credit.device || credit.product || "Cihaz qeyd edilməyib",
      })),
    )
    .sort(sortByBusinessDateDesc);

  const deviceRows = customerOrders.flatMap((order) => {
    const linkedCredit = getOrderCredit(order, customerCredits);
    const plan = linkedCredit ? getCreditDisplayPlan(linkedCredit) : null;
    const paidTotal = linkedCredit ? getCreditPaidTotal(plan) : Number(order.paid || 0);
    const balanceTotal = linkedCredit ? Number(plan.balance || 0) : getOrderBalance(order);
    const lineRows = getOrderProductRows(order);
    const lineTotal = lineRows.reduce((sum, line) => sum + Number(line.amount || 0), 0) || Number(order.amount || 0) || 1;

    return lineRows.map((line) => {
      const lineAmount = Number(line.amount || 0) || Math.round(Number(order.amount || 0) / Math.max(1, lineRows.length));
      const ratio = Math.min(1, Math.max(0, lineAmount / lineTotal));
      const contract = contractByOrderId.get(order.id) || contractById.get(order.contractId);
      return {
        id: `${order.id}-${line.product}-${line.qty}`,
        product: line.product,
        qty: line.qty,
        serials: line.serials,
        orderId: order.id,
        contractId: order.contractId || contract?.id || linkedCredit?.contractId || "—",
        creditId: linkedCredit?.id || "—",
        date: order.date,
        status: order.status,
        amount: Math.round(lineAmount),
        paid: Math.round(paidTotal * ratio),
        balance: Math.round(balanceTotal * ratio),
      };
    });
  });

  const totalPurchased = agreements.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalPaid = agreements.reduce((sum, row) => sum + Number(row.paid || 0), 0);
  const totalBalance = agreements.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const overdueAgreements = agreements.filter((agreement) => agreement.paymentState?.isOverdue);
  const nextPayment = creditAgreements
    .filter((agreement) => agreement.paymentState?.nextInstallment)
    .sort((a, b) => {
      const aTime = parsePaymentDate(a.nextDue)?.getTime() || 0;
      const bTime = parsePaymentDate(b.nextDue)?.getTime() || 0;
      return aTime - bTime;
    })[0];

  return {
    orders: customerOrders,
    credits: customerCredits,
    contracts: customerContracts,
    agreements,
    paymentRows,
    devices: deviceRows,
    totalPurchased,
    totalPaid,
    totalBalance,
    activeCreditCount: creditAgreements.filter((agreement) => !normalize(agreement.status).includes("bağlan")).length,
    overdueCount: overdueAgreements.length,
    openOrders: customerOrders.filter((order) => order.status !== "Təhvil verilib").length,
    nextPayment,
  };
}

export function buildCrmPipelineRows(customers, credits, orders) {
  return customers.map((customer, index) => {
    const customerCredits = getCustomerRelatedCredits(customer, credits);
    const customerOrders = getCustomerOrders(customer, orders);
    const latestOrder = getLatestOrder(customerOrders);
    const activeCreditCount = customerCredits.filter((credit) => !isCreditClosed(credit, getCreditDisplayPlan(credit))).length;
    const totalBalance = customerCredits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
    const overdueCredit = customerCredits.find((credit) =>
      getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue,
    );
    const limitLeft = Math.max(0, Number(customer.limit || 0) - Number(customer.debt || 0) - totalBalance);
    const openOrders = customerOrders.filter((order) => order.status !== "Təhvil verilib").length;
    const hasDeliveryFollowUp = openOrders > 0;
    const stage = overdueCredit
      ? "Risk follow-up"
      : hasDeliveryFollowUp
        ? "Təhvil sonrası"
        : customer.category === "Platin"
          ? "Upsell"
          : limitLeft > 3000
            ? "Təklif"
            : "Kredit uyğunluğu";
    const probability =
      stage === "Upsell" ? 82 : stage === "Təklif" ? 68 : stage === "Təhvil sonrası" ? 56 : stage === "Risk follow-up" ? 34 : 46;
    const owner = latestOrder?.sellerBonuses?.[0]?.seller || latestOrder?.seller || "Təyin edilməyib";
    const value = Math.max(0, Math.round((limitLeft || Number(customer.limit || 0) * 0.28) / 100) * 100);
    const nextPayment = customerCredits
      .map((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).nextInstallment)
      .find(Boolean);

    return {
      id: `${customer.fin}-${stage}`,
      customer,
      stage,
      owner,
      value,
      probability,
      source: latestOrder ? `Son sifariş: ${latestOrder.id}` : customer.category,
      nextAction:
        stage === "Risk follow-up"
          ? "Gecikmə üzrə zəng və SMS"
          : stage === "Təhvil sonrası"
            ? "Təhvil sonrası məmnunluq zəngi"
            : stage === "Upsell"
              ? "Premium cihaz təklifi"
              : stage === "Təklif"
                ? "Limitə uyğun kommersiya təklifi"
                : "AKB və limit yoxlaması",
      activeCreditCount,
      totalBalance,
      openOrders,
      limitLeft,
      nextPayment,
      lastOrderId: latestOrder?.id || "Yeni fürsət",
    };
  });
}

export function matchesCrmCustomerSegment(entry, segment) {
  const { customer, profile } = entry;
  if (segment === "Aktiv kredit") return profile.activeCreditCount > 0;
  if (segment === "Gecikmə") return profile.overdueCount > 0 || Number(customer.delay || 0) > 0;
  if (segment === "Açıq təhvil") return profile.openOrders > 0;
  if (segment === "Borcsuz") return Number(profile.totalBalance || 0) <= 0 && Number(customer.debt || 0) <= 0;
  return true;
}

export function matchesCrmCustomerSearch(entry, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  const { customer, profile } = entry;
  const text = [
    customer.name,
    customer.fin,
    customer.phone,
    customer.category,
    ...profile.agreements.flatMap((agreement) => [
      agreement.contractId,
      agreement.orderId,
      agreement.creditId,
      agreement.product,
      agreement.status,
    ]),
  ].join(" ");
  return normalize(text).includes(q);
}

export function matchesCrmPipelineFilter(row, filter) {
  return filter === "Hamısı" || row.stage === filter;
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

export function getCustomerRelatedCredits(customer, credits) {
  return credits.filter(
    (credit) => credit.fin === customer.fin || normalize(credit.customer) === normalize(customer.name),
  );
}

export function getCustomerOrders(customer, orders) {
  return orders.filter(
    (order) => order.fin === customer.fin || normalize(order.customer) === normalize(customer.name),
  );
}

export function getLatestOrder(orders) {
  return [...orders].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  })[0];
}

export function getCustomerContracts(customer, contracts = []) {
  return contracts.filter(
    (contract) => contract.fin === customer.fin || normalize(contract.customer) === normalize(customer.name),
  );
}

export function getCreditOrder(credit, orders = []) {
  return (
    orders.find(
      (order) =>
        order.id === credit.orderId ||
        order.creditId === credit.id ||
        (credit.contractId && order.contractId === credit.contractId),
    ) || null
  );
}

export function getCreditContract(credit, contracts = []) {
  return (
    contracts.find(
      (contract) =>
        contract.id === credit.contractId ||
        contract.creditId === credit.id ||
        (credit.orderId && contract.orderId === credit.orderId),
    ) || null
  );
}

export function getOrderProductRows(order) {
  if (Array.isArray(order.productLines) && order.productLines.length > 0) {
    return order.productLines.map((line) => {
      const qty = Math.max(1, Number(line.qty || 1));
      const amount = Math.max(0, Number(line.price || 0) * qty);
      return {
        product: line.product || order.products || "Cihaz qeyd edilməyib",
        qty,
        amount,
        serials: Array.isArray(line.serials) ? line.serials.filter(Boolean) : [],
      };
    });
  }

  return [
    {
      product: order.products || "Cihaz qeyd edilməyib",
      qty: 1,
      amount: Number(order.amount || 0),
      serials: [],
    },
  ];
}

export function getOrderCredit(order, credits = []) {
  return credits.find(
    (credit) =>
      credit.orderId === order.id ||
      credit.id === order.creditId ||
      (order.contractId && credit.contractId === order.contractId),
  );
}

export function sortByBusinessDateDesc(a, b) {
  const aTime = parsePaymentDate(a.date)?.getTime() || 0;
  const bTime = parsePaymentDate(b.date)?.getTime() || 0;
  return bTime - aTime;
}
