import { useMemo } from "react";
import { buildKpiEmployeeScoreRows, buildSalesBonusRows } from "../lib/appDomain.jsx";
import { buildKpiPeriodSnapshot, buildKpiTargetRows } from "../lib/appHelpers.jsx";
import { kpiPeriodView } from "../../services/financialSettlement.js";

// Sales bonuses, KPI scores and the selected KPI period (ledger period when settled, snapshot otherwise).
export function useKpiViews({ state, selectedKpiPeriod, kpiLedger }) {
  const salesBonusRows = useMemo(() => buildSalesBonusRows(state.orders), [state.orders]);
  const kpiEmployeeRows = useMemo(
    () => buildKpiEmployeeScoreRows(state.employees, salesBonusRows),
    [state.employees, salesBonusRows],
  );
  const kpiTargetRows = useMemo(
    () =>
      buildKpiTargetRows({
        targets: state.kpiTargets || [],
        employees: state.employees,
        employeeRows: kpiEmployeeRows,
        salesBonuses: salesBonusRows,
      }),
    [state.kpiTargets, state.employees, kpiEmployeeRows, salesBonusRows],
  );
  const activeKpiPeriod = useMemo(() => {
    const period = selectedKpiPeriod;
    const existing = kpiLedger.data?.periods.find(item => item.period.slice(0, 7) === period);
    if (existing) return kpiPeriodView(existing);
    return buildKpiPeriodSnapshot({
      period,
      targetRows: kpiTargetRows,
      employeeRows: kpiEmployeeRows,
      salesBonuses: salesBonusRows,
    });
  }, [selectedKpiPeriod, kpiLedger.data, kpiTargetRows, kpiEmployeeRows, salesBonusRows]);
  return { salesBonusRows, kpiEmployeeRows, kpiTargetRows, activeKpiPeriod };
}
