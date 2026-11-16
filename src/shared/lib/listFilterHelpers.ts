// Siyahı filtrləri: çatdırılma mərhələ etiketi və filtri, sürücü yükü statistikası, maliyyə əməliyyatlarının
// növ/tarix/axtarış filtrləri. appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir.
import { normalize } from "../../services/format.js";
import { parsePaymentDate } from "../../services/date.js";

type Row = Record<string, any>;

export interface DriverDeliveryStat {
  driver: string;
  active: number;
  completed: number;
  outForDelivery: number;
  risk: number;
  load: number;
}

function getDeliveryActionLabel(order: Row): string {
  if (order.status === "Təhvil verilib") return "Tamamlanıb";
  if (order.status === "Təhvilə çıxıb") return "Təhvili tamamla";
  return "Növbəti mərhələ";
}

function matchesDeliveryFilter(order: Row, filter: string): boolean {
  if (filter === "Hamısı") return true;
  if (filter === "Aktiv") return order.status !== "Təhvil verilib";
  if (filter === "Gecikmə riski") return order.risk === "Gecikmə riski";
  if (filter === "Sürücü yoxdur") return order.risk === "Sürücü yoxdur";
  if (filter === "Tamamlanan") return order.status === "Təhvil verilib";
  return order.status === filter;
}

function buildDriverDeliveryStats(orders: Row[]): DriverDeliveryStat[] {
  const driverMap = new Map<string, Omit<DriverDeliveryStat, "load">>();
  orders
    .filter((order) => order.driver && order.driver !== "—")
    .forEach((order) => {
      const current = driverMap.get(order.driver) || {
        driver: order.driver,
        active: 0,
        completed: 0,
        outForDelivery: 0,
        risk: 0,
      };
      if (order.status === "Təhvil verilib") {
        current.completed += 1;
      } else {
        current.active += 1;
      }
      if (order.status === "Təhvilə çıxıb" || order.status === "Yoldadır") {
        current.outForDelivery += 1;
      }
      if (order.risk !== "Normal" && order.risk !== "Tamamlandı") {
        current.risk += 1;
      }
      driverMap.set(order.driver, current);
    });
  const maxActive = Math.max(1, ...[...driverMap.values()].map((item) => item.active + item.outForDelivery));
  return [...driverMap.values()].map((item) => ({
    ...item,
    load: ((item.active + item.outForDelivery) / maxActive) * 100,
  }));
}

function matchesFinanceFilter(row: Row, filter: string): boolean {
  if (filter === "Daxilolma") return row.direction === "in";
  if (filter === "Xərc") return row.type === "Xərc";
  if (filter === "Satış") return row.type === "Satış";
  if (filter === "Kredit") return row.type === "Kredit";
  if (filter === "Gecikmə gəliri") return Number(row.penalty || 0) > 0;
  if (filter === "Təsdiq gözləyir") return row.direction === "pending";
  if (filter === "Cash təsirsiz") return row.direction === "accrual";
  return true;
}

function matchesFinanceDateRange(row: Row, dateFrom?: string | null, dateTo?: string | null): boolean {
  const rowDate = parsePaymentDate(row.date);
  if (!rowDate) return !dateFrom && !dateTo;
  const fromDate = dateFrom ? parsePaymentDate(dateFrom) : null;
  const toDate = dateTo ? parsePaymentDate(dateTo) : null;
  if (fromDate && rowDate < fromDate) return false;
  if (toDate && rowDate > toDate) return false;
  return true;
}

function matchesFinanceSearch(row: Row, query: string): boolean {
  if (!query.trim()) return true;
  return normalize([
    row.id,
    row.type,
    row.source,
    row.category,
    row.account,
    row.title,
    row.description,
    row.party,
    row.status,
    row.orderId,
    row.creditId,
    row.contractId,
    row.poId,
    row.expenseId,
  ].join(" ")).includes(normalize(query));
}

export {
  getDeliveryActionLabel,
  matchesDeliveryFilter,
  buildDriverDeliveryStats,
  matchesFinanceFilter,
  matchesFinanceDateRange,
  matchesFinanceSearch,
};
