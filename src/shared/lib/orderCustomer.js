import { dbCustomerToLegacy } from "../adapters/erpShape.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (value) => String(value ?? "").trim().toLowerCase();

// Finds the customer an order belongs to: by id, then FIN / tax id, then by name only when the
// name is unique. Names are not unique (two "Əli Məmmədov"s), so an ambiguous or unknown customer
// resolves to null instead of silently picking one.
export function resolveOrderCustomer({ customerId, fin, name } = {}, customers = []) {
  if (customerId) {
    const byId = customers.find((customer) => customer.id === customerId);
    if (byId) return byId;
    // An id from the database that is just not in the loaded page; the server validates it.
    if (UUID_RE.test(String(customerId))) return { id: customerId };
  }

  const finKey = norm(fin);
  if (finKey) {
    const byFin = customers.filter((customer) => {
      const shape = dbCustomerToLegacy(customer);
      return [shape.fin_code, customer.tax_id].some((value) => value && norm(value) === finKey);
    });
    if (byFin.length === 1) return byFin[0];
    if (byFin.length > 1) return null;
  }

  const nameKey = norm(name);
  if (!nameKey) return null;
  const byName = customers.filter((customer) => norm(customer.name) === nameKey);
  return byName.length === 1 ? byName[0] : null;
}
