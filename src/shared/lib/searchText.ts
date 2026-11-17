import { normalize } from "../../services/format.js";

// Search-only folding. In az-AZ lower-casing, Latin "I" becomes dotless "ı", so a user typing "inv"
// would miss "INV-2" (and any SKU, PO/invoice number or English name with a capital I). Fold the four
// I letters (i, ı, I, İ) to plain "i" so they all match each other. Use this only for free-text search;
// keep services/format.js normalize for keys and equality checks, where "ı" and "i" must stay distinct.
export function foldSearchText(value: unknown): string {
  return normalize(value).replace(/̇/g, "").replace(/ı/g, "i");
}
