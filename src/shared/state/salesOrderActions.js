import { pathForRecord } from "../../config/routes.js";
import { toLocalIsoDate } from "../../services/date.js";
import { money, normalize } from "../../services/format.js";
import { currentBusinessDate, getAvailableQuantity, normalizeOrderProductLines, summarizeOrderProducts } from "../lib/appDomain.jsx";
import { adjustStockRows, buildQuantityMap, buildSalesCreditForOrder, buildSellerBonusRows, calculateOrderLineTotal, getCreditIdForOrder, nextContractNumber, productLineSignature, releaseOrderSerialReservations, summarizeSellerBonusRows, updateSerialStatuses } from "../lib/appHelpers.jsx";
import { buildCreditPlan } from "../lib/credit.js";
import { resolveOrderCustomer } from "../lib/orderCustomer.js";

// Sales order and expense commands: edit, delete, linked order/credit navigation, vendor delete prompt. Moved unchanged from App.jsx.
export function createSalesOrderActions({ activeTenantId, auditCurrentState, auditOperation, creditRecords, dbCustomers, deleteDbOrder, navigate, notify, requirePermission, setMobileNav, setModal, setQuery, setState, state, updateDbOrder }) {
  function getSalesOrderLinkedCredit(snapshot, order) {
    if (!order) return null;
    return (snapshot.credits || []).find(
      (credit) => credit.orderId === order.id || credit.id === order.creditId || credit.id === getCreditIdForOrder(order),
    );
  }



  function openLinkedSalesOrder(orderId) {
    const normalizedOrderId = normalize(orderId);
    const targetOrder = state.orders.find((order) =>
      normalize(order.id) === normalizedOrderId ||
      normalize(order.orderNo || order.order_no) === normalizedOrderId
    );
    if (!orderId) return;
    setQuery("");
    navigate(pathForRecord('sales', targetOrder?.id || orderId));
    setMobileNav(false);
    auditOperation({
      module: "Kredit/Satış",
      action: "Bağlı sifarişə keçid edildi",
      detail: targetOrder ? `${targetOrder.orderNo || targetOrder.id} · ${targetOrder.customer}` : String(orderId),
    });
  }

  function openLinkedCredit(creditId) {
    const targetCredit = creditRecords.find((credit) => credit.id === creditId);

    if (!targetCredit) {
      notify("Bağlı kredit tapılmadı.", "warning");
      return;
    }

    setQuery("");
    navigate(pathForRecord('credits', creditId));
    setMobileNav(false);
    auditOperation({
      module: "CRM/Kredit",
      action: "Bağlı kreditə keçid edildi",
      detail: `${creditId} · ${targetCredit.customer}`,
    });
  }


  function openVendorDelete(vendorKey) {
    if (!requirePermission("vendors.manage", "vendoru silmək")) return;
    setModal({ type: "vendorDelete", vendorKey });
  }

  function validateSalesOrderEdit(order, values) {
    const nextProductLines = normalizeOrderProductLines(values.productLines);
    const nextWarehouseId = values.warehouseId || order.warehouseId || state.warehouses?.[0]?.id;
    const oldWarehouseId = order.warehouseId || state.warehouses?.[0]?.id;
    const nextStatus = values.status || order.status;
    const delivered = order.status === "Təhvil verilib";
    const productOrWarehouseChanged =
      nextWarehouseId !== oldWarehouseId ||
      productLineSignature(nextProductLines) !== productLineSignature(order.productLines || []);

    if (nextProductLines.length === 0) {
      notify("Satış əməliyyatında ən azı bir məhsul sətri olmalıdır.", "warning");
      return false;
    }
    if (Number(values.amount ?? calculateOrderLineTotal(nextProductLines)) <= 0) {
      notify("Satış məbləği 0-dan böyük olmalıdır.", "warning");
      return false;
    }
    if (delivered && productOrWarehouseChanged) {
      notify("Təhvil verilmiş satışda məhsul və anbar dəyişmək üçün geri qaytarma əməliyyatı lazımdır.", "warning");
      return false;
    }
    if (delivered && nextStatus !== "Təhvil verilib") {
      notify("Təhvil verilmiş satışı əvvəlki mərhələyə qaytarmaq üçün ayrıca geri qaytarma axını lazımdır.", "warning");
      return false;
    }
    if (!delivered && nextStatus === "Təhvil verilib") {
      notify("Məhsulu anbardan çıxarmaq üçün Təhvil modulundakı tamamla əməliyyatından istifadə edin.", "warning");
      return false;
    }
    if (!productOrWarehouseChanged) return true;

    const warehouseRows = state.warehouseStock?.[nextWarehouseId] || [];
    const oldQuantities =
      oldWarehouseId === nextWarehouseId ? buildQuantityMap(order.productLines || []) : new Map();
    const nextQuantities = buildQuantityMap(nextProductLines);
    const insufficient = [...nextQuantities.entries()].find(([product, qty]) => {
      const stockItem = warehouseRows.find((item) => item.product === product);
      const currentOrderReservation = oldQuantities.get(product) || 0;
      return !stockItem || getAvailableQuantity(stockItem) + currentOrderReservation < qty;
    });

    if (insufficient) {
      notify(`${insufficient[0]} üçün seçilən anbarda kifayət qədər satış qalığı yoxdur.`, "warning");
      return false;
    }
    return true;
  }

  function updateSalesOrder(orderId, values) {
    if (!requirePermission("sales.create", "satış əməliyyatını redaktə etmək")) return;
    const existingOrder = state.orders.find((order) => order.id === orderId);
    if (!existingOrder) {
      notify("Satış əməliyyatı tapılmadı.", "warning");
      return;
    }
    if (!validateSalesOrderEdit(existingOrder, values)) return;

    // Persist header changes to DB when the order originated from DB
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (activeTenantId && updateDbOrder && uuidRe.test(String(orderId))) {
      const statusMap = {
        "Yeni": "draft",
        "Təsdiqlənib": "confirmed",
        "Yolda": "shipped",
        "Təhvil verilib": "delivered",
        "Ləğv edilib": "cancelled",
      };
      // Keep the linked customer unless the form picked another one; an unresolved name used to
      // overwrite customer_id with null and unlink the order.
      const customerChanged = Boolean(values.customerId && values.customerId !== existingOrder.customerId)
        || Boolean(values.customer && values.customer !== existingOrder.customer);
      const custRow = customerChanged
        ? resolveOrderCustomer({ customerId: values.customerId, fin: values.fin, name: values.customer }, dbCustomers || [])
        : null;
      if (customerChanged && !custRow) {
        notify("Müştəri dəqiq müəyyən edilmədi, sifarişin müştərisi dəyişdirilmədi.", "warning");
      }
      const patch = {
        ...(custRow ? { customer_id: custRow.id } : {}),
        order_date: values.date || existingOrder.date || toLocalIsoDate(),
        notes: values.note ?? existingOrder.note ?? null,
        status: statusMap[values.status || existingOrder.status] || "draft",
      };
      updateDbOrder(orderId, patch).catch((err) => {
        console.error("[orders] DB update failed:", err);
        notify(`Sifariş DB-də yenilənmədi: ${err.message || err}`, "warning");
      });
    }


    setState((current) => {
      const order = current.orders.find((item) => item.id === orderId);
      if (!order) return current;

      const productLines = normalizeOrderProductLines(values.productLines);
      const sellerBonuses = buildSellerBonusRows(values.sellers);
      const sellerSummary = summarizeSellerBonusRows(sellerBonuses) || order.seller || "Təyin edilməyib";
      const oldWarehouseId = order.warehouseId || current.warehouses?.[0]?.id;
      const nextWarehouseId = values.warehouseId || oldWarehouseId;
      const warehouseName =
        current.warehouses.find((warehouse) => warehouse.id === nextWarehouseId)?.name ||
        order.warehouseName ||
        "Baş Anbar";
      const amount = Math.max(0, Number(values.amount ?? calculateOrderLineTotal(productLines)));
      const paymentMethod = values.paymentMethod || order.paymentMethod || "Nağd";
      const isCreditSale = paymentMethod === "Kredit";
      const creditPlan = isCreditSale
        ? buildCreditPlan({
            total: amount,
            initialPayment: Math.min(amount, Math.max(0, Number(values.initialPayment ?? order.initialPayment ?? order.paid ?? 0))),
            months: values.creditMonths || order.creditMonths || 12,
          })
        : null;
      const paid = isCreditSale
        ? creditPlan.initialPayment
        : Math.min(amount, Math.max(0, Number(values.paid ?? order.paid ?? amount)));
      const paymentStatus = isCreditSale ? "Kredit satış" : paid >= amount ? "Ödənilib" : paid > 0 ? "Qalıqlı" : "Ödəniş gözləyir";
      const linkedCredit = getSalesOrderLinkedCredit(current, order);
      const creditId = isCreditSale ? order.creditId || linkedCredit?.id || getCreditIdForOrder(order) : null;
      const contractId = isCreditSale ? order.contractId || linkedCredit?.contractId || nextContractNumber(current) : null;
      const delivered = order.status === "Təhvil verilib";
      const productOrWarehouseChanged =
        nextWarehouseId !== oldWarehouseId ||
        productLineSignature(productLines) !== productLineSignature(order.productLines || []);

      let warehouseStock = current.warehouseStock;
      let stock = current.stock;
      if (!delivered && productOrWarehouseChanged) {
        const oldQuantities = buildQuantityMap(order.productLines || []);
        const nextQuantities = buildQuantityMap(productLines);
        warehouseStock = { ...(current.warehouseStock || {}) };

        if (oldWarehouseId && warehouseStock[oldWarehouseId]) {
          warehouseStock[oldWarehouseId] = releaseOrderSerialReservations(
            adjustStockRows(warehouseStock[oldWarehouseId], oldQuantities, { reservedDelta: -1 }),
            order.productLines || [],
            order.id,
          );
        }
        if (nextWarehouseId && warehouseStock[nextWarehouseId]) {
          warehouseStock[nextWarehouseId] = updateSerialStatuses(
            adjustStockRows(warehouseStock[nextWarehouseId], nextQuantities, { reservedDelta: 1 }),
            productLines,
            "Rezervdə",
            order.id,
          );
        }
        stock = adjustStockRows(
          adjustStockRows(current.stock, oldQuantities, { reservedDelta: -1 }),
          nextQuantities,
          { reservedDelta: 1 },
        );
      }

      const nextOrder = {
        ...order,
        customer: values.customer || order.customer,
        fin: values.fin || order.fin,
        productLines,
        products: productLines.map((line) => `${line.product}${line.qty > 1 ? ` x${line.qty}` : ""}`).join(", "),
        seller: sellerSummary,
        sellerBonuses,
        amount,
        paid,
        status: values.status || order.status,
        date: values.date || order.date || currentBusinessDate,
        address: values.address || order.address || "Qeyd edilməyib",
        warehouseId: nextWarehouseId,
        warehouseName,
        paymentMethod,
        paymentStatus,
        creditId,
        contractId,
        creditMonths: creditPlan?.months || null,
        initialPayment: creditPlan?.initialPayment || 0,
        creditBalance: creditPlan?.balance || 0,
        creditMonthly: creditPlan?.monthly || 0,
        creditLastPayment: creditPlan?.lastPayment || 0,
        note: values.note || "",
        bonusTotal: Number(values.bonusTotal ?? (paid * sellerBonuses.reduce((sum, item) => sum + Number(item.bonus || 0), 0)) / 100),
      };

      const nextCredits = isCreditSale
        ? (() => {
            const creditRecord = buildSalesCreditForOrder(nextOrder, linkedCredit);
            const exists = (current.credits || []).some((credit) => credit.id === creditRecord.id || credit.orderId === order.id);
            return exists
              ? current.credits.map((credit) => (credit.id === creditRecord.id || credit.orderId === order.id ? creditRecord : credit))
              : [creditRecord, ...(current.credits || [])];
          })()
        : (current.credits || []).filter((credit) => credit.orderId !== order.id && credit.id !== order.creditId);

      const nextContracts = isCreditSale
        ? (() => {
            const contractRecord = {
              id: contractId,
              customer: nextOrder.customer,
              fin: nextOrder.fin,
              product: summarizeOrderProducts(nextOrder),
              amount,
              status: current.contracts.find((contract) => contract.id === contractId)?.status || "Hazırlanır",
              orderId: order.id,
            };
            const exists = current.contracts.some((contract) => contract.id === contractId || contract.orderId === order.id);
            return exists
              ? current.contracts.map((contract) => (contract.id === contractId || contract.orderId === order.id ? contractRecord : contract))
              : [contractRecord, ...current.contracts];
          })()
        : current.contracts.filter((contract) => contract.orderId !== order.id && contract.id !== order.contractId);

      return auditCurrentState(
        {
          ...current,
          stock,
          warehouseStock,
          orders: current.orders.map((item) => (item.id === order.id ? nextOrder : item)),
          credits: nextCredits,
          contracts: nextContracts,
        },
        {
          module: "Satış",
          action: "Satış əməliyyatı redaktə edildi",
          detail: `${order.id} · ${nextOrder.customer} · ${money(amount)}`,
        },
      );
    });
    setModal(null);
    notify(`${orderId} satış əməliyyatı yeniləndi.`);
  }

  async function deleteSalesOrder(orderId) {
    if (!requirePermission("sales.create", "satış əməliyyatını silmək")) return;
    const targetOrder = state.orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      notify("Satış əməliyyatı tapılmadı.", "warning");
      return;
    }

    // DB delete for UUID ids (order_items cascade)
    const isUuid = typeof orderId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (isUuid && deleteDbOrder) {
      try {
        await deleteDbOrder(orderId);
      } catch (e) {
        notify(`Silmə DB xətası: ${e?.message || e}`, "warning");
        return;
      }
    }

    setState((current) => {
      const order = current.orders.find((item) => item.id === orderId);
      if (!order) return current;

      const linkedCredit = getSalesOrderLinkedCredit(current, order);
      const linkedCreditIds = new Set([order.creditId, linkedCredit?.id, getCreditIdForOrder(order)].filter(Boolean));
      const delivered = order.status === "Təhvil verilib";
      let warehouseStock = current.warehouseStock;
      let stock = current.stock;

      if (!delivered && Array.isArray(order.productLines) && order.productLines.length > 0) {
        const quantities = buildQuantityMap(order.productLines);
        const warehouseId = order.warehouseId || current.warehouses?.[0]?.id;
        warehouseStock = { ...(current.warehouseStock || {}) };
        if (warehouseId && warehouseStock[warehouseId]) {
          warehouseStock[warehouseId] = releaseOrderSerialReservations(
            adjustStockRows(warehouseStock[warehouseId], quantities, { reservedDelta: -1 }),
            order.productLines,
            order.id,
          );
        }
        stock = adjustStockRows(current.stock, quantities, { reservedDelta: -1 });
      }

      return auditCurrentState(
        {
          ...current,
          stock,
          warehouseStock,
          orders: current.orders.filter((item) => item.id !== order.id),
          credits: (current.credits || []).filter(
            (credit) => credit.orderId !== order.id && !linkedCreditIds.has(credit.id),
          ),
          contracts: current.contracts.filter((contract) => contract.orderId !== order.id && contract.id !== order.contractId),
          cashEntries: (current.cashEntries || []).filter((entry) => !linkedCreditIds.has(entry.creditId)),
        },
        {
          module: "Satış",
          action: "Satış əməliyyatı silindi",
          detail: `${order.id} · ${order.customer} · ${delivered ? "təhvil verilmiş satış" : "rezerv açıldı"}`,
        },
      );
    });
    setModal(null);
    notify(`${orderId} satış əməliyyatı silindi.`);
  }



  function updateExpense(expenseId, values) {
    if (!requirePermission("finance.manage", "xərc əməliyyatını redaktə etmək")) return;
    const amount = Math.max(0, Number(values.amount || 0));
    if (!values.description || !values.category || amount <= 0) {
      notify("Xərc üçün təsvir, kateqoriya və düzgün məbləğ daxil edin.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          expenses: current.expenses.map((expense) =>
            expense.id === expenseId
              ? {
                  ...expense,
                  description: values.description,
                  category: values.category,
                  date: values.date || expense.date || currentBusinessDate,
                  amount,
                  status: values.status || expense.status,
                  note: values.note || expense.note || "",
                }
              : expense,
          ),
        },
        {
          module: "Maliyyə",
          action: "Xərc əməliyyatı redaktə edildi",
          detail: `${expenseId} · ${values.description} · ${money(amount)}`,
        },
      ),
    );
    setModal(null);
    notify(`${expenseId} xərc əməliyyatı yeniləndi.`);
  }

  function deleteExpense(expenseId) {
    if (!requirePermission("finance.manage", "xərc əməliyyatını silmək")) return;
    const targetExpense = state.expenses.find((expense) => expense.id === expenseId);
    if (!targetExpense) {
      notify("Xərc əməliyyatı tapılmadı.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          expenses: current.expenses.filter((expense) => expense.id !== expenseId),
        },
        {
          module: "Maliyyə",
          action: "Xərc əməliyyatı silindi",
          detail: `${expenseId} · ${targetExpense.description} · ${money(targetExpense.amount)}`,
        },
      ),
    );
    setModal(null);
    notify(`${expenseId} xərc əməliyyatı silindi.`);
  }

  return { getSalesOrderLinkedCredit, openLinkedSalesOrder, openLinkedCredit, openVendorDelete, validateSalesOrderEdit, updateSalesOrder, deleteSalesOrder, updateExpense, deleteExpense };
}
