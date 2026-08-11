export const modalRegistry = Object.freeze({
  warehouse: "warehouse",
  stockIntake: "stockIntake",
  warehouseImport: "warehouseImport",
  purchaseOrder: "purchaseOrder",
  vendors: "vendor",
  vendorDelete: "vendorDelete",
  hr: "employee",
  department: "department",
  leaveRequest: "leaveRequest",
  vacancy: "vacancy",
  employeeDelete: "employeeDelete",
  product: "product",
  financeAccount: "financeAccount",
  contractPrint: "contractPrint",
  salesOperation: "salesOperation",
  salesOperationDelete: "salesOperationDelete",
  expenseOperation: "expenseOperation",
  expenseOperationDelete: "expenseOperationDelete",
  sales: "salesOrder",
  dashboard: "salesOrder",
});

export function resolveModalKind(type) {
  return modalRegistry[type] || "generic";
}
