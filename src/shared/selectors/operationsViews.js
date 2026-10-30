import { useMemo } from "react";
import { buildProductionPlanRows, buildProjectRoiRows } from "../lib/appHelpers.jsx";

// Project ROI and production plan rows.
export function useOperationsViews({ state }) {
  const projectRoiRows = useMemo(
    () =>
      buildProjectRoiRows({
        projects: state.projects || [],
        orders: state.orders,
        expenses: state.expenses,
        products: state.products || [],
      }),
    [state.projects, state.orders, state.expenses, state.products],
  );
  const productionRows = useMemo(
    () => buildProductionPlanRows(state.productionPlans || [], state.stock, state.warehouseStock, state.products || [], state.warehouses),
    [state.productionPlans, state.stock, state.warehouseStock, state.products, state.warehouses],
  );
  return { projectRoiRows, productionRows };
}
