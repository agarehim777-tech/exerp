import { useEffect } from "react";
import { dbCustomerToLegacy, dbOrderToLegacy, dbProductToLegacy } from "../adapters/erpShape.js";

export function useDbReadBridge({ tenantId, ready, customers, products, orders, ordersLoaded, inventory, setState }) {
  useEffect(() => {
    if (!tenantId || !ready) return;
    if (!customers.length && !products.length && !orders.length && !inventory.warehouses.length && !inventory.balances.length) return;

    const warehouseStock = inventory.balances.reduce((byWarehouse, balance) => {
      const warehouseId = balance.warehouse_id || balance.warehouse?.id;
      if (!warehouseId) return byWarehouse;
      const rows = byWarehouse[warehouseId] || [];
      rows.push({
        id: balance.id || `${warehouseId}-${balance.product_id}`,
        productId: balance.product_id,
        product: balance.product?.name || balance.product?.sku || "Məhsul",
        sku: balance.product?.sku || "",
        total: Number(balance.qty ?? balance.on_hand ?? 0),
        reserved: Number(balance.reserved || 0),
        problemQty: Number(balance.problem_qty || 0),
        reorderLevel: Number(balance.reorder_point ?? balance.minimum_level ?? 0),
        costPrice: Number(balance.avg_cost || 0),
        price: Number(balance.product?.price ?? balance.avg_cost ?? 0),
      });
      byWarehouse[warehouseId] = rows;
      return byWarehouse;
    }, {});

    const aggregateStock = Object.values(warehouseStock).flat().reduce((byProduct, row) => {
      const key = row.productId || row.sku || row.product;
      const current = byProduct.get(key) || { ...row, total: 0, reserved: 0, problemQty: 0 };
      current.total += row.total;
      current.reserved += row.reserved;
      current.problemQty += row.problemQty;
      byProduct.set(key, current);
      return byProduct;
    }, new Map());

    setState((current) => ({
      ...current,
      ...(customers.length ? { customers: customers.map(dbCustomerToLegacy) } : {}),
      ...(products.length ? { products: products.map(dbProductToLegacy) } : {}),
      ...(ordersLoaded ? { orders: orders.map(dbOrderToLegacy) } : {}),
      ...(inventory.warehouses.length ? {
        warehouses: inventory.warehouses.map((warehouse) => ({
          id: warehouse.id, code: warehouse.code, name: warehouse.name,
          address: warehouse.address || "—",
          city: warehouse.address?.split(",")[0]?.trim() || "—",
          manager: "Təyin edilməyib", type: "Mərkəzi",
          capacity: Math.max(100, (warehouseStock[warehouse.id] || []).reduce((sum, row) => sum + Number(row.total || 0), 0)),
          status: warehouse.is_active === false ? "Passiv" : "Aktiv",
        })),
        warehouseStock,
        stock: [...aggregateStock.values()],
      } : {}),
    }));
  }, [tenantId, ready, customers, products, orders, ordersLoaded, inventory.warehouses, inventory.balances, setState]);
}
