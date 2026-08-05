import { supabase } from "../integrations/supabase/client";

const MODULES = new Set(["procurement", "warehouse", "credits", "crm", "finance", "hr", "production", "communications", "reports", "platform"]);
const unwrap = (result) => { if (result.error) throw result.error; return result.data; };
const assertContext = (tenantId, module) => {
  if (!tenantId) throw new Error("Tenant seçilməyib.");
  if (!MODULES.has(module)) throw new Error(`Dəstəklənməyən modul: ${module}`);
};

export async function listWorkflowRecords({ tenantId, module, recordType, status }) {
  assertContext(tenantId, module);
  let query = supabase.from("workflow_records").select("*, workflow_lines(*), workflow_approvals(*)")
    .eq("tenant_id", tenantId).eq("module", module).order("created_at", { ascending: false });
  if (recordType) query = query.eq("record_type", recordType);
  if (status) query = query.eq("status", status);
  return unwrap(await query);
}

export async function saveWorkflowRecord({ tenantId, module, record, lines, approvals }) {
  assertContext(tenantId, module);
  const saved = unwrap(await supabase.from("workflow_records").upsert(
    { ...record, tenant_id: tenantId, module },
    { onConflict: "tenant_id,module,record_type,record_no" },
  ).select().single());
  if (Array.isArray(lines)) {
    unwrap(await supabase.from("workflow_lines").delete().eq("workflow_id", saved.id));
  }
  if (Array.isArray(approvals)) {
    unwrap(await supabase.from("workflow_approvals").delete().eq("workflow_id", saved.id));
  }
  if (lines?.length) unwrap(await supabase.from("workflow_lines").insert(lines.map((line, index) => ({ ...line, tenant_id: tenantId, workflow_id: saved.id, line_no: line.line_no || index + 1 }))));
  if (approvals?.length) unwrap(await supabase.from("workflow_approvals").insert(approvals.map((step, index) => ({ ...step, tenant_id: tenantId, workflow_id: saved.id, step_no: step.step_no || index + 1 }))));
  return saved;
}

export async function decideWorkflowStep({ tenantId, approvalId, status, comment }) {
  if (!tenantId) throw new Error("Tenant seçilməyib.");
  if (!["approved", "rejected", "skipped"].includes(status)) throw new Error("Yanlış təsdiq statusu.");
  return unwrap(await supabase.from("workflow_approvals").update({ status, comment: comment || null, decided_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("id", approvalId).select().single());
}

export async function listEntityTimeline({ tenantId, entityType, entityId }) {
  if (!tenantId || !entityType || !entityId) throw new Error("Timeline konteksti natamamdır.");
  return unwrap(await supabase.from("entity_timeline").select("*").eq("tenant_id", tenantId)
    .eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false }));
}

export async function addEntityTimelineEvent({ tenantId, entityType, entityId, event }) {
  return unwrap(await supabase.from("entity_timeline").insert({ ...event, tenant_id: tenantId, entity_type: entityType, entity_id: entityId }).select().single());
}

export async function listInventoryUnits({ tenantId, warehouseId, productId, status }) {
  if (!tenantId) throw new Error("Tenant seçilməyib.");
  let query = supabase.from("inventory_units").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
  if (warehouseId) query = query.eq("warehouse_id", warehouseId);
  if (productId) query = query.eq("product_id", productId);
  if (status) query = query.eq("status", status);
  return unwrap(await query);
}

export async function saveInventoryUnit({ tenantId, unit }) {
  if (!tenantId || !unit?.warehouse_id || !unit?.product_id) throw new Error("Anbar və məhsul tələb olunur.");
  const payload = {
    ...unit,
    tenant_id: tenantId,
    serial_no: unit.serial_no?.trim() || null,
    imei: unit.imei?.trim() || null,
    batch_no: unit.batch_no?.trim() || null,
    location_code: unit.location_code?.trim() || null,
    rack_code: unit.rack_code?.trim() || null,
    bin_code: unit.bin_code?.trim() || null,
    quantity: Number(unit.quantity || 0),
    unit_cost: Number(unit.unit_cost || 0),
  };
  return unwrap(await supabase.from("inventory_units").upsert(payload).select().single());
}

export async function removeInventoryUnit({ tenantId, unitId }) {
  if (!tenantId || !unitId) throw new Error("Stok vahidi seçilməyib.");
  return unwrap(await supabase.from("inventory_units").delete().eq("tenant_id", tenantId).eq("id", unitId).select().single());
}

export async function queueNotification({ tenantId, notification }) {
  if (!tenantId || !notification?.recipient || !notification?.channel || !notification?.body) throw new Error("Bildiriş üçün alıcı, kanal və mətn tələb olunur.");
  return unwrap(await supabase.from("notification_deliveries").insert({ ...notification, tenant_id: tenantId }).select().single());
}

export async function listEmployee360({ tenantId, employeeId }) {
  if (!tenantId || !employeeId) throw new Error("Əməkdaş seçilməyib.");
  return unwrap(await supabase.from("employee_events").select("*").eq("tenant_id", tenantId)
    .eq("employee_id", employeeId).order("created_at", { ascending: false }));
}

export async function listCreditPortfolio({ tenantId }) {
  if (!tenantId) throw new Error("Tenant seçilməyib.");
  return unwrap(await supabase.from("credit_contracts")
    .select("*, customer:customers(id,name,fin), installments:credit_installments(id,due_date,principal_due,principal_paid,penalty_due,penalty_paid,status)")
    .eq("tenant_id", tenantId).order("risk_score", { ascending: false }).order("created_at", { ascending: false }));
}

export async function refreshCreditOverdue({ tenantId, asOf }) {
  if (!tenantId) throw new Error("Tenant seçilməyib.");
  return unwrap(await supabase.rpc("refresh_credit_overdue", { _tenant_id: tenantId, _as_of: asOf || new Date().toISOString().slice(0, 10) }));
}

export async function updateCreditCollection({ tenantId, credit, stage, reason }) {
  if (!tenantId || !credit?.id || !stage) throw new Error("Kredit və mərhələ tələb olunur.");
  const updated = unwrap(await supabase.from("credit_contracts").update({ collection_stage: stage })
    .eq("tenant_id", tenantId).eq("id", credit.id).select().single());
  unwrap(await supabase.from("credit_adjustments").insert({
    tenant_id: tenantId, credit_id: credit.id, adjustment_type: "collection",
    old_value: { collection_stage: credit.collection_stage }, new_value: { collection_stage: stage },
    reason: reason || "Kolleksiya mərhələsi yeniləndi",
  }));
  return updated;
}

export async function listReconciliations({ tenantId }) {
  if (!tenantId) throw new Error("Tenant seçilməyib.");
  return unwrap(await supabase.from("financial_reconciliations").select("*")
    .eq("tenant_id", tenantId).order("created_at", { ascending: false }));
}

export async function saveReconciliation({ tenantId, reconciliation }) {
  if (!tenantId) throw new Error("Tenant seçilməyib.");
  return unwrap(await supabase.from("financial_reconciliations")
    .upsert({ ...reconciliation, tenant_id: tenantId }).select().single());
}
