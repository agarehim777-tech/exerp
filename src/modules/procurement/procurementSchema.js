export function isMissingPoPaymentsTable(error) {
  if (!error) return false;
  const message = String(error.message || error.details || "").toLowerCase();
  return (
    (error.code === "PGRST205" && message.includes("po_payments")) ||
    (message.includes("po_payments") &&
      (message.includes("schema cache") || message.includes("could not find") || message.includes("does not exist")))
  );
}

export async function readLegacyPoPayments(client, tenantId, enabled = false) {
  if (!enabled) return { data: [], error: null, disabled: true };
  return client.from("po_payments").select("*").eq("tenant_id", tenantId)
    .order("payment_date", { ascending: false });
}
