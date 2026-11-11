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
