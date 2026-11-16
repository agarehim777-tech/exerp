// Legacy bridge: the sales modals live in SalesOperationModal.jsx and SalesOrderModal.jsx, and their form helpers in
// ../services/salesOrderForm.ts. AppWidgets.jsx lazy-imports this file, so keep these exports; change code in those files.
export { SalesOperationModal } from "./SalesOperationModal.jsx";
export { SalesOrderModal } from "./SalesOrderModal.jsx";
export { buildSalesProductOptions } from "../services/salesOrderForm.ts";
