export type AppRecord = Record<string, unknown> & { id?: string };
export interface CollectionRow { tenant_id: string; collection: string; record_key: string; position: number; data: AppRecord }
type Definition = { table: string; fields: Record<string, string> };
export const collectionDefinitions: Record<string, Definition> = {
  employees: { table: 'employees', fields: { name: 'full_name', position: 'position', department: 'department', email: 'email', phone: 'phone', salary: 'salary' } },
  departments: { table: 'hr_departments', fields: {"name": "name", "parentDepartment": "parent_department", "description": "description", "status": "status"} },
  leaveRequests: { table: 'hr_leave_requests', fields: {"employeeId": "employee_id", "employeeName": "employee_name", "department": "department", "type": "type", "from": "from_date", "to": "to_date", "days": "days", "approver": "approver", "status": "status"} },
  vacancies: { table: 'hr_vacancies', fields: {"role": "role", "department": "department", "candidates": "candidates", "stage": "stage", "owner": "owner", "targetDate": "target_date", "status": "status"} },
  contracts: { table: 'business_contracts', fields: {"customer": "customer", "fin": "fin", "product": "product", "amount": "amount", "status": "status", "orderId": "order_id"} },
  cashEntries: { table: 'finance_entries', fields: {"description": "description", "amount": "amount", "currency": "currency", "direction": "direction", "category": "category", "date": "date", "status": "status", "accountId": "account_id"} },
  financeAccounts: { table: 'finance_account_records', fields: {"name": "name", "code": "code", "type": "type", "currency": "currency", "openingBalance": "opening_balance", "status": "status"} },
  credits: { table: 'finance_credit_records', fields: {"customer": "customer", "contractId": "contract_id", "orderId": "order_id", "total": "total", "initialPayment": "initial_payment", "balance": "balance", "months": "months", "status": "status"} },
};
export function definitionFor(collection: string): Definition {
  const definition = collectionDefinitions[collection];
  if (!definition) throw new Error(`Unknown collection: ${collection}`);
  return definition;
}
export function toDedicatedRow(row: CollectionRow) {
  const { fields } = definitionFor(row.collection);
  const metadata = { ...row.data };
  const result: Record<string, unknown> = { tenant_id: row.tenant_id, record_key: row.record_key, sort_position: row.position };
  for (const [appKey, column] of Object.entries(fields)) {
    if (Object.hasOwn(row.data, appKey)) result[column] = row.data[appKey];
    delete metadata[appKey];
  }
  if (row.collection === 'employees' && !result.full_name) result.full_name = '';
  result.metadata = metadata;
  return result;
}
export function fromDedicatedRow(row: Record<string, unknown>, collection: string): CollectionRow {
  const { fields } = definitionFor(collection);
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as AppRecord : {};
  const data: AppRecord = { ...metadata };
  for (const [appKey, column] of Object.entries(fields)) {
    if (row[column] !== null && row[column] !== undefined) data[appKey] = row[column];
  }
  return { tenant_id: String(row.tenant_id), collection, record_key: String(row.record_key ?? row.id), position: Number(row.sort_position ?? 0), data };
}
