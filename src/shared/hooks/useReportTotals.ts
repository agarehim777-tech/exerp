import { useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { toLocalIsoDate } from "../../services/date.js";

export interface ReportTotals {
  revenue: number;
  order_count: number;
  active_customers: number;
  operating_expense: number;
  production_cost: number;
  production_count: number;
}

// Maps the report period labels to an inclusive date range; "Hamısı" means unbounded.
export function reportPeriodRange(period: string, snapshotDate: string): { from: string | null; to: string | null } {
  if (period === "Hamısı") return { from: null, to: null };
  const snap = snapshotDate ? new Date(snapshotDate) : new Date();
  const year = snap.getFullYear();
  let startMonth = 0;
  let months = 12;
  if (period === "Bu ay") { startMonth = snap.getMonth(); months = 1; }
  else if (period === "Bu rüb") { startMonth = Math.floor(snap.getMonth() / 3) * 3; months = 3; }
  return {
    from: toLocalIsoDate(new Date(year, startMonth, 1)),
    to: toLocalIsoDate(new Date(year, startMonth + months, 0)),
  };
}

// Server-computed headline totals; null until loaded or when the read fails (callers fall back to row sums).
export function useReportTotals(tenantId: string | null | undefined, period: string, snapshotDate: string) {
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  useEffect(() => {
    let current = true;
    setTotals(null);
    if (!tenantId) return undefined;
    const { from, to } = reportPeriodRange(period, snapshotDate);
    supabase.rpc("report_totals", { _tenant_id: tenantId, _from: from ?? undefined, _to: to ?? undefined }).then(({ data, error }) => {
      if (!current) return;
      if (error || !data) { console.warn("report_totals failed", error); return; }
      const raw = data as Record<string, unknown>;
      setTotals({
        revenue: Number(raw.revenue) || 0,
        order_count: Number(raw.order_count) || 0,
        active_customers: Number(raw.active_customers) || 0,
        operating_expense: Number(raw.operating_expense) || 0,
        production_cost: Number(raw.production_cost) || 0,
        production_count: Number(raw.production_count) || 0,
      });
    });
    return () => { current = false; };
  }, [tenantId, period, snapshotDate]);
  return totals;
}

export interface ReportTrendRow { label: string; revenue: number; expense: number }
export interface ReportRiskRow { id: string; area: string; title: string; amount: number; owner: string; action: string; priority: string; status: string }

export function mapTrendRows(raw: unknown): ReportTrendRow[] {
  const fmt = new Intl.DateTimeFormat("az-AZ", { month: "short" });
  return (Array.isArray(raw) ? raw : []).map((row: Record<string, unknown>) => ({
    label: fmt.format(new Date(`${String(row.month)}T00:00:00`)),
    revenue: Number(row.revenue) || 0,
    expense: Number(row.expense) || 0,
  }));
}

export function mapRiskRows(raw: unknown): ReportRiskRow[] {
  return (Array.isArray(raw) ? raw : []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""), area: String(row.area ?? ""), title: String(row.title ?? ""),
    amount: Number(row.amount) || 0, owner: String(row.owner ?? ""), action: String(row.action ?? ""),
    priority: String(row.priority ?? ""), status: String(row.status ?? ""),
  }));
}

// Six-month chart and current risk register computed in the database; null while loading or on failure.
export function useReportSeries(tenantId: string | null | undefined, snapshotDate: string) {
  const [series, setSeries] = useState<{ trend: ReportTrendRow[]; risks: ReportRiskRow[] } | null>(null);
  useEffect(() => {
    let current = true;
    setSeries(null);
    if (!tenantId) return undefined;
    const anchor = snapshotDate || toLocalIsoDate(new Date());
    Promise.all([
      supabase.rpc("report_monthly_trend", { _tenant_id: tenantId, _anchor: anchor, _months: 6 }),
      supabase.rpc("report_risk_rows", { _tenant_id: tenantId, _limit: 8 }),
    ]).then(([trend, risks]) => {
      if (!current) return;
      if (trend.error || risks.error) { console.warn("report series failed", trend.error || risks.error); return; }
      setSeries({ trend: mapTrendRows(trend.data), risks: mapRiskRows(risks.data) });
    });
    return () => { current = false; };
  }, [tenantId, snapshotDate]);
  return series;
}

export interface ReportModuleRow { module: string; metric: string; count: string; signal: string; status: string }

type Section = Record<string, unknown>;
const num = (section: unknown, key: string) => Number((section as Section | undefined)?.[key]) || 0;

// Maps report_module_summary to the analytics table rows (HR stays client-side) and production risks.
export function mapModuleSummary(raw: unknown, money: (value: number) => string) {
  const r = (raw || {}) as Section;
  const sales = r.sales, credit = r.credit, stock = r.stock, po = r.procurement, fin = r.finance, inv = r.invoices, pr = r.production;
  const openDeliveries = num(sales, "open_deliveries"), overdue = num(credit, "overdue"), low = num(stock, "low");
  const openPo = num(po, "open"), pending = num(fin, "pending"), invOverdue = num(inv, "overdue"), invOpen = num(inv, "open_balance");
  const prodRisk = num(pr, "risk");
  const rows: ReportModuleRow[] = [
    { module: "Satış", metric: money(num(sales, "revenue")), count: `${num(sales, "count")} sifariş`,
      signal: openDeliveries > 0 ? `${openDeliveries} təhvil gözləyir` : "Bağlı axın", status: openDeliveries > 5 ? "Nəzarət" : "Hazır" },
    { module: "Kredit", metric: money(num(credit, "balance")), count: `${num(credit, "count")} müqavilə`,
      signal: overdue > 0 ? `${overdue} gecikmə` : "Gecikmə yoxdur", status: overdue > 0 ? "Risk" : "Hazır" },
    { module: "Anbar", metric: `${num(stock, "sellable")}/${num(stock, "total")}`, count: `${num(stock, "sku")} SKU`,
      signal: low > 0 ? `${low} minimum qalıq` : "Stok sağlam", status: low > 0 ? "Nəzarət" : "Hazır" },
    { module: "Vendor / PO", metric: money(num(po, "approved_amount")), count: `${num(po, "count")} PO`,
      signal: openPo > 0 ? `${openPo} təsdiqdə` : `${num(po, "vendors")} vendor aktiv`, status: openPo > 0 ? "Nəzarət" : "Hazır" },
    { module: "Maliyyə", metric: money(num(fin, "cash_inflow")), count: `${num(fin, "count")} xərc`,
      signal: pending > 0 ? `${pending} xərc təsdiqdə` : `${money(num(fin, "approved_amount"))} təsdiqli xərc`, status: pending > 0 ? "Nəzarət" : "Hazır" },
    { module: "Faktura", metric: money(invOpen), count: `${num(inv, "count")} faktura`,
      signal: invOverdue > 0 ? `${invOverdue} gecikmiş faktura` : "Gecikmiş faktura yoxdur", status: invOverdue > 0 || invOpen > 0 ? "Nəzarət" : "Hazır" },
  ];
  const production: ReportModuleRow = { module: "İstehsalat", metric: money(num(pr, "cost")), count: `${num(pr, "count")} plan`,
    signal: prodRisk > 0 ? "Xammal riski var" : "Xammal təmin olunub", status: prodRisk > 0 ? "Risk" : "Hazır" };
  return { rows, production, productionRisks: mapRiskRows(r.production_risks) };
}

// Server-computed module analytics for the selected period; null while loading or on failure.
export function useReportModules(tenantId: string | null | undefined, period: string, snapshotDate: string) {
  const [summary, setSummary] = useState<unknown>(null);
  useEffect(() => {
    let current = true;
    setSummary(null);
    if (!tenantId) return undefined;
    const { from, to } = reportPeriodRange(period, snapshotDate);
    supabase.rpc("report_module_summary", { _tenant_id: tenantId, _from: from ?? undefined, _to: to ?? undefined }).then(({ data, error }) => {
      if (!current) return;
      if (error || !data) { console.warn("report_module_summary failed", error); return; }
      setSummary(data);
    });
    return () => { current = false; };
  }, [tenantId, period, snapshotDate]);
  return summary;
}
