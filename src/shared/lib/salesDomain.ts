// Sales/CRM domain logic moved from appDomainSales.jsx: seller bonus rows and text, sales order filters and risk,
// Customer 360 summary, CRM pipeline rows and filters, customer/credit/order lookups.
// appDomainSales.jsx re-exports these for old imports; change them here.
import { getOrderPaymentMethod, summarizeOrderProducts, getOrderBalance, normalizeOrderProductLines, getDeliveryAgeDays } from "../../modules/warehouse/deliveryDomain.jsx";
import { normalize } from "../../services/format.js";
import { currentBusinessDate } from "./businessDate";
import { parsePaymentDate } from "../../services/date.js";
import { getCreditDisplayPlan, getCreditManagementStatus, getCreditPaidTotal, getCreditPaymentState, getCreditSourceLabel, isCreditClosed } from "./credit.js";
import { baseCreditDate } from "./financeDomain.ts";
import { foldSearchText } from "./searchText.ts";

type Row = Record<string, any>;

export function buildSalesBonusRows(orders: Row[]) {
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

export function getOrderSellerBonuses(order: Row) {
  if (Array.isArray(order.sellerBonuses) && order.sellerBonuses.length > 0) {
    return order.sellerBonuses;
  }
  return parseSellerBonusText(order.seller);
}

export function matchesSalesOrderFilter(order: Row, filter: string) {
  if (filter === "Kredit") return getOrderPaymentMethod(order) === "Kredit";
  if (filter === "Nağd") return getOrderPaymentMethod(order) === "Nağd";
  if (filter === "Qalıqlı") return getOrderBalance(order) > 0;
  if (filter === "Təhvil gözləyən") return order.status !== "Təhvil verilib";
  if (filter === "Tamamlanan") return order.status === "Təhvil verilib";
  if (filter === "Riskli") return getOrderBalance(order) > 0 || (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3);
  return true;
}

export function matchesSalesOrderSearch(order: Row, query: string) {
  if (!query.trim()) return true;
  const q = foldSearchText(query);
  return foldSearchText(
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

export function matchesSalesDateRange(order: Row, dateFrom?: string | null, dateTo?: string | null) {
  const orderDate = parsePaymentDate(order.date);
  if (!orderDate) return !dateFrom && !dateTo;
  const from = dateFrom ? parsePaymentDate(dateFrom) : null;
  const to = dateTo ? parsePaymentDate(dateTo) : null;
  if (from && orderDate < from) return false;
  if (to && orderDate > to) return false;
  return true;
}

export function getSalesCashImpact(order: Row) {
  return Math.max(0, Number(order.paid || 0));
}

export function getOrderBonusAmount(order: Row) {
  const paid = Number(order.paid || 0);
  return Math.round(
    getOrderSellerBonuses(order).reduce((sum, sellerBonus) => sum + (paid * Number(sellerBonus.bonus || 0)) / 100, 0),
  );
}

export function getSalesOrderRiskStatus(order: Row) {
  if (order.status === "Təhvil verilib" && getOrderBalance(order) <= 0) return "Tamamlanıb";
  if (getOrderBalance(order) > 0 && order.status !== "Təhvil verilib") return "Borclu + təhvil";
  if (getOrderBalance(order) > 0) return "Borclu";
  if (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3) return "Təhvil riski";
  if (order.status !== "Təhvil verilib") return "Təhvil gözləyir";
  return "Sağlam";
}

export function getOrderBonusText(order: Row) {
  const bonuses = getOrderSellerBonuses(order);
  if (bonuses.length === 0) return "Bonus yoxdur";
  return bonuses.map((item) => `${getShortSellerName(item.seller)} ${Number(item.bonus || 0)}%`).join(", ");
}

export function getShortSellerName(name: string | null | undefined) {
  return String(name || "")
    .trim()
    .split(" ")[0];
}

export function parseSellerBonusText(text: string | null | undefined) {
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

export function buildCustomer360(customer: Row, { credits = [], orders = [], contracts = [] }: { credits?: Row[]; orders?: Row[]; contracts?: Row[] }) {
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
      remainingMonths: plan.installments.filter((installment: Row) => Number(installment.amount || 0) > 0).length,
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
      (credit.payments || []).map((payment: Row) => ({
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
    const balanceTotal = linkedCredit ? Number(plan!.balance || 0) : getOrderBalance(order);
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

export function buildCrmPipelineRows(customers: Row[], credits: Row[], orders: Row[]) {
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

export function matchesCrmCustomerSegment(entry: Row, segment: string) {
  const { customer, profile } = entry;
  if (segment === "Aktiv kredit") return profile.activeCreditCount > 0;
  if (segment === "Gecikmə") return profile.overdueCount > 0 || Number(customer.delay || 0) > 0;
  if (segment === "Açıq təhvil") return profile.openOrders > 0;
  if (segment === "Borcsuz") return Number(profile.totalBalance || 0) <= 0 && Number(customer.debt || 0) <= 0;
  return true;
}

export function matchesCrmCustomerSearch(entry: Row, query: string) {
  if (!query.trim()) return true;
  const q = foldSearchText(query);
  const { customer, profile } = entry;
  const text = [
    customer.name,
    customer.fin,
    customer.phone,
    customer.category,
    ...profile.agreements.flatMap((agreement: Row) => [
      agreement.contractId,
      agreement.orderId,
      agreement.creditId,
      agreement.product,
      agreement.status,
    ]),
  ].join(" ");
  return foldSearchText(text).includes(q);
}

export function matchesCrmPipelineFilter(row: Row, filter: string) {
  return filter === "Hamısı" || row.stage === filter;
}

export function getCustomerRelatedCredits(customer: Row, credits: Row[]) {
  return credits.filter(
    (credit) => credit.fin === customer.fin || normalize(credit.customer) === normalize(customer.name),
  );
}

export function getCustomerOrders(customer: Row, orders: Row[]) {
  return orders.filter(
    (order) => order.fin === customer.fin || normalize(order.customer) === normalize(customer.name),
  );
}

export function getLatestOrder(orders: Row[]) {
  return [...orders].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  })[0];
}

export function getCustomerContracts(customer: Row, contracts: Row[] = []) {
  return contracts.filter(
    (contract) => contract.fin === customer.fin || normalize(contract.customer) === normalize(customer.name),
  );
}

export function getCreditOrder(credit: Row, orders: Row[] = []) {
  return (
    orders.find(
      (order) =>
        order.id === credit.orderId ||
        order.creditId === credit.id ||
        (credit.contractId && order.contractId === credit.contractId),
    ) || null
  );
}

export function getCreditContract(credit: Row, contracts: Row[] = []) {
  return (
    contracts.find(
      (contract) =>
        contract.id === credit.contractId ||
        contract.creditId === credit.id ||
        (credit.orderId && contract.orderId === credit.orderId),
    ) || null
  );
}

export function getOrderProductRows(order: Row) {
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

export function getOrderCredit(order: Row, credits: Row[] = []) {
  return credits.find(
    (credit) =>
      credit.orderId === order.id ||
      credit.id === order.creditId ||
      (order.contractId && credit.contractId === order.contractId),
  );
}

export function sortByBusinessDateDesc(a: Row, b: Row) {
  const aTime = parsePaymentDate(a.date)?.getTime() || 0;
  const bTime = parsePaymentDate(b.date)?.getTime() || 0;
  return bTime - aTime;
}
