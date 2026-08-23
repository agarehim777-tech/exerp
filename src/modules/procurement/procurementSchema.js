export function isMissingPoPaymentsTable(error) {
  if (!error) return false;
  const message = String(error.message || error.details || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    (message.includes("po_payments") &&
      (message.includes("schema cache") || message.includes("could not find") || message.includes("does not exist")))
  );
}
