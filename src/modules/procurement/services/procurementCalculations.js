import { normalize } from "../../../services/format.js";
import { buildProductLookup, buildPurchaseOrderCoverage, getReorderPoint } from "../../../shared/lib/appDomain.jsx";

export function getProductProcurementSnapshot(productName, warehouseStock = {}, products = [], purchaseOrders = []) {
  const product = products.find((item) => item.name === productName);
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const stockRows = Object.values(warehouseStock).flatMap((items) => items || []).filter((item) => item.product === productName);
  const total = stockRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reserved = stockRows.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
  const available = Math.max(0, total - reserved);
  const reorderPoint = getReorderPoint({
    product: productName,
    total,
    reserved,
    price: Number(product?.salePrice || stockRows[0]?.price || 0),
    reorderLevel: product?.reorderLevel,
  }, productsByName);
  const targetQty = Math.max(reorderPoint > 0 ? reorderPoint * 2 : 0, 4);
  const suggestedQty = Math.max(0, targetQty - available);
  const coverage = orderCoverage.get(normalize(productName)) || { orderedQty: 0, count: 0, latest: null };
  const orderedQty = Number(coverage.orderedQty || 0);
  return {
    product,
    total,
    reserved,
    available,
    reorderPoint,
    targetQty,
    suggestedQty,
    orderedQty,
    openPoCount: Number(coverage.count || 0),
    latestPoId: coverage.latest?.id || "",
    orderGap: Math.max(0, suggestedQty - orderedQty),
  };
}
