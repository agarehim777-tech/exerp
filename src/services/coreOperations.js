import { supabase } from "../integrations/supabase/client";

function requireValue(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${field} tələb olunur`);
  }
  return value;
}

async function callRpc(name, payload) {
  const { data, error } = await supabase.rpc(name, payload);
  if (error) {
    const wrapped = new Error(error.message || `${name} əməliyyatı alınmadı`);
    wrapped.code = error.code;
    wrapped.details = error.details;
    throw wrapped;
  }
  return data;
}

export async function detectCoreOperations() {
  const { error } = await supabase
    .from("credit_contracts")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (!error) return { available: true, reason: null };
  const unavailable = error.code === "PGRST205"
    || error.code === "42P01"
    || /schema cache|does not exist|could not find/i.test(error.message || "");
  return {
    available: !unavailable,
    reason: unavailable ? "core_operations_migration_required" : error.message,
  };
}

export function postCreditPayment({
  tenantId,
  creditId,
  receiptNo,
  amount,
  penaltyAmount = 0,
  cashAccountId,
  paymentMethod = "cash",
  note = null,
}) {
  return callRpc("post_credit_payment", {
    _tenant_id: requireValue(tenantId, "tenantId"),
    _credit_id: requireValue(creditId, "creditId"),
    _receipt_no: requireValue(receiptNo, "receiptNo"),
    _amount: Number(requireValue(amount, "amount")),
    _penalty_amount: Number(penaltyAmount || 0),
    _cash_account_id: requireValue(cashAccountId, "cashAccountId"),
    _payment_method: paymentMethod,
    _note: note,
  });
}

export function createCreditContract({
  tenantId,
  contractNo,
  customerId,
  orderId,
  principal,
  initialPayment = 0,
  termMonths,
  startDate,
}) {
  return callRpc("create_credit_contract", {
    _tenant_id: requireValue(tenantId, "tenantId"),
    _contract_no: requireValue(contractNo, "contractNo"),
    _customer_id: requireValue(customerId, "customerId"),
    _order_id: requireValue(orderId, "orderId"),
    _principal: Number(requireValue(principal, "principal")),
    _initial_payment: Number(initialPayment || 0),
    _term_months: Number(requireValue(termMonths, "termMonths")),
    _start_date: requireValue(startDate, "startDate"),
  });
}

export function receiveStock({
  tenantId,
  warehouseId,
  productId,
  quantity,
  unitCost = 0,
  referenceType = null,
  referenceId = null,
  note = null,
}) {
  return callRpc("receive_stock", {
    _tenant_id: requireValue(tenantId, "tenantId"),
    _warehouse_id: requireValue(warehouseId, "warehouseId"),
    _product_id: requireValue(productId, "productId"),
    _quantity: Number(requireValue(quantity, "quantity")),
    _unit_cost: Number(unitCost || 0),
    _reference_type: referenceType,
    _reference_id: referenceId,
    _note: note,
  });
}

export function reserveStock({
  tenantId,
  warehouseId,
  productId,
  orderId,
  orderItemId = null,
  quantity,
}) {
  return callRpc("reserve_stock", {
    _tenant_id: requireValue(tenantId, "tenantId"),
    _warehouse_id: requireValue(warehouseId, "warehouseId"),
    _product_id: requireValue(productId, "productId"),
    _order_id: requireValue(orderId, "orderId"),
    _order_item_id: orderItemId,
    _quantity: Number(requireValue(quantity, "quantity")),
  });
}

export function completeDelivery({
  tenantId,
  deliveryId,
  recipientName,
  recipientDocument = null,
}) {
  return callRpc("complete_delivery", {
    _tenant_id: requireValue(tenantId, "tenantId"),
    _delivery_id: requireValue(deliveryId, "deliveryId"),
    _recipient_name: requireValue(recipientName, "recipientName"),
    _recipient_document: recipientDocument,
  });
}

export function payExpense({ tenantId, expenseId, cashAccountId }) {
  return callRpc("pay_expense", {
    _tenant_id: requireValue(tenantId, "tenantId"),
    _expense_id: requireValue(expenseId, "expenseId"),
    _cash_account_id: requireValue(cashAccountId, "cashAccountId"),
  });
}

export async function loadCreditLedger(tenantId) {
  requireValue(tenantId, "tenantId");
  const { data, error } = await supabase
    .from("credit_contracts")
    .select(`
      *,
      customer:customers(id,name,fin),
      installments:credit_installments(*),
      payments:credit_payments(*)
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadWarehouseBalances(tenantId) {
  requireValue(tenantId, "tenantId");
  const { data, error } = await supabase
    .from("stock_balances")
    .select(`
      tenant_id,warehouse_id,product_id,on_hand,reserved,minimum_level,updated_at,
      warehouse:warehouses(id,code,name),
      product:products(id,sku,name)
    `)
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return data || [];
}
