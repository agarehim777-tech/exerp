// KPI hədəfləri: faktiki dəyər, irəliləyiş, çəkili bal və KPI periodunun snapshot-u (hədəf və ödəniş sətirləri).
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { initialState } from "../../data.js";
import { total } from "../utils/aggregate.js";

type Row = Record<string, any>;

export interface KpiSources {
  employees?: Row[];
  employeeRows?: Row[];
  salesBonuses?: Row[];
}

export interface KpiTargetRow extends Row {
  actual: number;
  progress: number;
  weightedScore: number;
  status: string;
}

function ensureKpiTargets(targets: Row[] | null | undefined = []): Row[] {
  return Array.isArray(targets) && targets.length > 0 ? targets : initialState.kpiTargets || [];
}

function getKpiActualValue(metricKey: unknown, { employees = [], employeeRows = [], salesBonuses = [] }: KpiSources = {}): number {
  if (metricKey === "companyKpi") {
    return employees.length ? Math.round(total(employees, "kpi") / employees.length) : 0;
  }
  if (metricKey === "salesBonus") return Math.round(total(salesBonuses, "bonusAmount"));
  if (metricKey === "hrBonus") return Math.round(total(employeeRows, "performanceBonus"));
  if (metricKey === "highPerformers") {
    return employees.length
      ? Math.round((employees.filter((employee) => Number(employee.kpi || 0) >= 95).length / employees.length) * 100)
      : 0;
  }
  return 0;
}

function buildKpiTargetRows({ targets = [], employees = [], employeeRows = [], salesBonuses = [] }: KpiSources & { targets?: Row[] } = {}): KpiTargetRow[] {
  return ensureKpiTargets(targets).map((target) => {
    const actual = getKpiActualValue(target.metricKey, { employees, employeeRows, salesBonuses });
    const targetValue = Number(target.target || 0);
    const progress = targetValue > 0 ? Math.round((actual / targetValue) * 100) : 0;
    const weightedScore = Math.round((Math.min(progress, 100) / 100) * Number(target.weight || 0));

    return {
      ...target,
      actual,
      progress,
      weightedScore,
      status: progress >= 100 ? "Tamamlandı" : progress >= 75 ? "Nəzarət" : "Risk",
    };
  });
}

function buildKpiPeriodSnapshot({ period, targetRows = [], employeeRows = [], salesBonuses = [], existing = {}, stamp = "" }: {
  period?: string;
  targetRows?: Row[];
  employeeRows?: Row[];
  salesBonuses?: Row[];
  existing?: Row;
  stamp?: string;
} = {}): Row {
  const totalWeight = Math.max(1, total(targetRows, "weight"));
  const companyScore = Math.round((total(targetRows, "weightedScore") / totalWeight) * 100);
  const salesBonusTotal = Math.round(total(salesBonuses, "bonusAmount"));
  const performanceBonusTotal = Math.round(total(employeeRows, "performanceBonus"));
  const payoutAmount = Math.round(total(employeeRows, "payoutAmount"));

  return {
    id: existing.id || `KPI-PER-${period}`,
    period,
    status: existing.status || "Açıq period",
    approvalStatus: existing.approvalStatus || "Hazırlanır",
    payoutStatus: existing.payoutStatus || "Gözləyir",
    companyScore,
    employeeCount: employeeRows.length,
    targetCount: targetRows.length,
    salesBonusTotal,
    performanceBonusTotal,
    payoutAmount,
    closedAt: existing.closedAt || "",
    approvedAt: existing.approvedAt || "",
    approvedBy: existing.approvedBy || "",
    paidAt: existing.paidAt || "",
    payoutExpenseId: existing.payoutExpenseId || "",
    updatedAt: stamp || existing.updatedAt || "",
    targetRows: targetRows.map((row) => ({
      id: row.id,
      name: row.name,
      target: row.target,
      unit: row.unit,
      weight: row.weight,
      actual: row.actual,
      progress: row.progress,
      status: row.status,
    })),
    payoutRows: employeeRows
      .filter((row) => Number(row.payoutAmount || 0) > 0)
      .map((row) => ({
        employeeId: row.id,
        employee: row.name,
        department: row.department,
        kpi: row.kpi,
        performanceBonus: row.performanceBonus,
        salesBonus: row.salesBonus,
        payoutAmount: row.payoutAmount,
      })),
  };
}

export { ensureKpiTargets, getKpiActualValue, buildKpiTargetRows, buildKpiPeriodSnapshot };
