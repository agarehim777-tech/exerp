import { normalize } from "../../services/format.js";
import { baseFinanceDate } from "../lib/appDomain.jsx";
import { addStockToRows } from "../lib/appHelpers.jsx";

// Purchase order commands: create and approve. Moved unchanged from App.jsx.
export function createPurchaseOrderActions({ auditCurrentState, notify, requirePermission, setState, state }) {
  function createPurchaseOrder(row) {
    if (!requirePermission("vendors.po", "PO yaratmaq")) return false;

    const qty = Math.max(1, Math.round(Number(row.orderGap || row.recommendedQty || row.qty || 0)));
    const warehouse = state.warehouses.find((item) => item.id === row.warehouseId) || state.warehouses[0];
    const catalogProduct = (state.products || []).find((item) => normalize(item.name) === normalize(row.product));

    if (!warehouse || !row.product) {
      notify("PO yaratmaq üçün məhsul və anbar məlumatı lazımdır.", "warning");
      return false;
    }

    const unitCost = Math.max(
      0,
      Number(row.unitCost ?? row.costPrice ?? catalogProduct?.costPrice ?? Math.round(Number(row.price || catalogProduct?.salePrice || 0) * 0.76)),
    );
    const salePrice = Math.max(0, Number(row.salePrice ?? catalogProduct?.salePrice ?? row.price ?? unitCost));
    const amount = Math.max(0, Math.round(Number(row.amount ?? qty * unitCost)));
    const reorderPoint = Number(row.reorderPoint ?? catalogProduct?.reorderLevel ?? 0);
    const availableAtOrder = Number(row.available ?? 0);

    const po = {
      id: `PO-${Date.now()}`,
      product: row.product,
      vendor: row.vendor,
      supplierSource: row.supplierSource || row.factory || row.vendor,
      procurementType: row.procurementType || "Zavod sifarişi",
      qty,
      unitCost,
      price: salePrice,
      amount,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      status: "Təsdiq gözləyir",
      date: row.date || baseFinanceDate,
      expectedAt: row.expectedAt || "",
      reorderPoint,
      availableAtOrder,
      orderedForMinimum: reorderPoint > 0 && availableAtOrder <= reorderPoint,
      note: row.note || "",
    };

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          purchaseOrders: [po, ...(current.purchaseOrders || [])],
        },
        {
          module: "Vendor",
          action: "PO yaradıldı",
          detail: `${po.product}: ${po.qty} ədəd · ${po.vendor}`,
        },
      ),
    );
    notify(`${po.id} yaradıldı və təsdiq gözləyir.`);
    return true;
  }

  function approvePurchaseOrder(poId) {
    if (!requirePermission("vendors.po", "PO təsdiqləmək və anbara mədaxil etmək")) return;

    const targetPo = (state.purchaseOrders || []).find((item) => item.id === poId);

    if (!targetPo || targetPo.status === "Təsdiq edildi") {
      notify("PO təsdiqlənmədi.", "warning");
      return;
    }

    setState((current) => {
      const po = (current.purchaseOrders || []).find((item) => item.id === poId);
      if (!po || po.status === "Təsdiq edildi") return current;

      const warehouseId = po.warehouseId || current.warehouses[0]?.id;
      const warehouseName =
        current.warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || po.warehouseName || "Anbar";
      const nextPo = {
        ...po,
        warehouseId,
        warehouseName,
        status: "Təsdiq edildi",
        approvedAt: baseFinanceDate,
        receivedAt: baseFinanceDate,
      };
      const procurementExpense = {
        id: `EXP-${po.id}`,
        description: `PO alış - ${po.product}`,
        category: "Satınalma",
        date: baseFinanceDate,
        amount: Number(po.amount || 0),
        status: "Təsdiq gözləyir",
        source: "Vendor PO",
        poId: po.id,
      };
      const nextExpenses = current.expenses.some((expense) => expense.id === procurementExpense.id)
        ? current.expenses
        : [procurementExpense, ...current.expenses];
      const catalogProduct = (current.products || []).find((item) => normalize(item.name) === normalize(po.product));
      const stockPrice = Number(po.price || catalogProduct?.salePrice || po.unitCost || 0);

      return auditCurrentState(
        {
          ...current,
          purchaseOrders: (current.purchaseOrders || []).map((item) => (item.id === poId ? nextPo : item)),
          warehouseStock: {
            ...current.warehouseStock,
            [warehouseId]: addStockToRows(
              current.warehouseStock?.[warehouseId] || [],
              po.product,
              po.qty,
              stockPrice,
              warehouseId,
              catalogProduct,
            ),
          },
          stock: addStockToRows(current.stock, po.product, po.qty, stockPrice, "", catalogProduct),
          expenses: nextExpenses,
        },
        {
          module: "Vendor/Anbar/Maliyyə",
          action: "PO təsdiqləndi və mədaxil edildi",
          detail: `${po.product}: ${po.qty} ədəd ${warehouseName} anbarına daxil oldu`,
        },
      );
    });

    notify(`${targetPo.id} təsdiqləndi və anbara mədaxil edildi.`, "success");
  }

  return { createPurchaseOrder, approvePurchaseOrder };
}
