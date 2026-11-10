// Focused domain commands; dependencies are explicit and supplied by App.
export function createWarehouseActions({ acceptance, activeRoleInfo, activeTenantId, addStockToRows, adjustStockRows, appendAudit, auditCurrentState, auditOperation, baseDeliveryDate, beginTenantRequest, buildQuantityMap, currentUser, dbInventory, dbOrders, describeStockError, error, formatPaymentDate, fromWarehouseId, getActiveRole, getAvailableQuantity, getDeliveryPlan, getDeliveryStockCheck, importWarehouseStockAtomic, isDeliveryQueueOrder, normalize, notify, parsePaymentDate, refreshDbOrders, refreshDbProducts, requirePermission, selectedWarehouseId, setModal, setSelectedWarehouseId, setState, state, summarizeOrderProducts, supabase, toWarehouseId, updateSerialStatuses }) {
function updateWarehouse(id, values) {
    if (!requirePermission("warehouse.manage", "anbarı redaktə etmək")) return;

    setState((current) => ({
      ...current,
      warehouses: current.warehouses.map((warehouse) =>
        warehouse.id === id
          ? {
              ...warehouse,
              code: values.code,
              name: values.name,
              city: values.city,
              address: values.address,
              manager: values.manager,
              type: values.type,
              capacity: Number(values.capacity || 0),
              status: values.status,
            }
          : warehouse,
      ),
    }));
    setModal(null);
    notify("Anbar məlumatları yeniləndi.");
    auditOperation({
      module: "Anbar",
      action: "Anbar redaktə edildi",
      detail: `${values.name} (${values.code})`,
    });
  }

function recordStockIntake(values) {
    if (!requirePermission("warehouse.manage", "anbara mədaxil etmək")) return;

    const warehouseId = values.warehouseId;
    const warehouse = state.warehouses.find((item) => item.id === warehouseId);
    const product = String(values.product || "").trim();
    const qty = Math.max(0, Math.round(Number(values.qty || 0)));
    const price = Math.max(0, Number(values.price || 0));

    if (!warehouse || !product || qty <= 0) {
      notify("Mədaxil üçün anbar, məhsul və etibarlı miqdar daxil edin.", "warning");
      return;
    }

    setState((current) => {
      const knownProduct = (current.products || []).find((item) => normalize(item.name) === normalize(product));
      const catalogProduct = knownProduct
        ? {
            ...knownProduct,
            salePrice: price || Number(knownProduct.salePrice || 0),
          }
        : {
            id: `PRD-${Date.now()}`,
            name: product,
            sku: `SKU-${Date.now().toString().slice(-6)}`,
            category: "Digər",
            unit: "ədəd",
            salePrice: price,
            costPrice: 0,
            reorderLevel: 0,
            serialTracked: price >= 1500,
            status: "Aktiv",
          };
      const products = knownProduct
        ? current.products.map((item) => (item.id === knownProduct.id ? catalogProduct : item))
        : [catalogProduct, ...(current.products || [])];

      return auditCurrentState(
        {
          ...current,
          products,
          warehouseStock: {
            ...current.warehouseStock,
            [warehouseId]: addStockToRows(
              current.warehouseStock?.[warehouseId] || [],
              product,
              qty,
              price,
              warehouseId,
              catalogProduct,
            ),
          },
          stock: addStockToRows(current.stock, product, qty, price, "", catalogProduct),
        },
        {
          module: "Anbar",
          action: "İlkin mədaxil edildi",
          detail: `${product}: ${qty} ədəd · ${warehouse.name}`,
        },
      );
    });
    setModal(null);
    notify(`${product}: ${qty} ədəd ${warehouse.name} anbarına mədaxil edildi.`);
  }

async function importWarehouseStock(rows, requestKey) {
    if (!requirePermission("warehouse.manage", "anbara toplu import etmək")) return;
    const isCurrent = beginTenantRequest();
    await importWarehouseStockAtomic(activeTenantId, rows, requestKey);
    if (!isCurrent()) return;
    await Promise.all([refreshDbProducts(), dbInventory.refresh()]);
    if (!isCurrent()) return;
    setModal(null);
    notify(`${rows.length} stok sətri serverdə anbara import edildi.`);
  }

function deleteWarehouse(id) {
    if (!requirePermission("warehouse.manage", "anbarı silmək")) return;

    const warehouse = state.warehouses.find((item) => item.id === id);
    const warehouseItems = state.warehouseStock?.[id] || [];
    const totalQty = warehouseItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const reservedQty = warehouseItems.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
    const deliveryCount = state.orders.filter((order) => isDeliveryQueueOrder(order) && order.warehouseId === id).length;
    const openPoCount = (state.purchaseOrders || []).filter(
      (po) => po.warehouseId === id && !["Təsdiq edildi", "Ləğv edildi"].includes(po.status),
    ).length;

    if (totalQty > 0 || reservedQty > 0 || deliveryCount > 0 || openPoCount > 0) {
      const reason = [
        totalQty > 0 ? `${totalQty} stok` : "",
        reservedQty > 0 ? `${reservedQty} rezerv` : "",
        deliveryCount > 0 ? `${deliveryCount} açıq təhvil` : "",
        openPoCount > 0 ? `${openPoCount} açıq PO` : "",
      ].filter(Boolean).join(" · ");
      notify(`${warehouse?.name || id} silinmədi: əvvəl ${reason} bağlanmalıdır.`, "warning");
      auditOperation({
        module: "Anbar",
        action: "Anbar silinməsi bloklandı",
        detail: `${warehouse?.name || id} · ${reason}`,
        status: "Bloklandı",
      });
      return;
    }

    const remaining = state.warehouses.filter((warehouse) => warehouse.id !== id);
    setState((current) => {
      const nextWarehouseStock = { ...current.warehouseStock };
      delete nextWarehouseStock[id];
      return {
        ...current,
        warehouses: current.warehouses.filter((warehouse) => warehouse.id !== id),
        warehouseStock: nextWarehouseStock,
      };
    });
    if (selectedWarehouseId === id) {
      setSelectedWarehouseId(remaining[0]?.id || "all");
    }
    notify("Anbar silindi.");
    auditOperation({
      module: "Anbar",
      action: "Anbar silindi",
      detail: id,
    });
  }

async function completeWarehouseDelivery(orderId, acceptance = {}) {
    if (!requirePermission("delivery.complete", "təhvili tamamlamaq")) return;
    const isCurrentDelivery = beginTenantRequest("delivery");

    const targetOrder = state.orders.find((order) => order.id === orderId);

    if (
      !targetOrder ||
      targetOrder.status === "Təhvil verilib" ||
      !Array.isArray(targetOrder.productLines) ||
      targetOrder.productLines.length === 0
    ) {
      notify("Bu sifariş üçün təhvil əməliyyatı aparıla bilmədi.", "warning");
      return;
    }

    const initialCheck = getDeliveryStockCheck(
      { ...targetOrder, warehouseId: targetOrder.warehouseId || state.warehouses?.[0]?.id },
      state.warehouseStock,
    );
    if (!initialCheck.ok) {
      notify(initialCheck.reason || "Təhvil üçün anbar rezervi kifayət etmir.", "warning");
      auditOperation({
        module: "Təhvil/Anbar",
        action: "Təhvil bloklandı",
        detail: `${orderId} · ${initialCheck.reason}`,
        status: "Bloklandı",
      });
      return;
    }

    const deliveryWillComplete = initialCheck.plan?.lines?.every(
      (line) => Number(line.delivered || 0) + Number(line.deliverable || 0) >= Number(line.ordered || 0),
    );

    // Server is authoritative for a completed delivery: physical stock and
    // the linked reservation must be committed atomically before the UI is
    // allowed to show the order as delivered.
    if (deliveryWillComplete && activeTenantId) {
      const dbOrder = dbOrders.find((order) =>
        String(order.id) === String(orderId) || String(order.order_no) === String(targetOrder.orderNo || orderId),
      );
      if (!dbOrder?.id) {
        notify("Təhvil ediləcək satış bazada tapılmadı.", "warning");
        return;
      }
      const warehouseId = targetOrder.warehouseId || state.warehouses?.[0]?.id;
      const { error } = await supabase.rpc("complete_sales_delivery", {
        _tenant_id: activeTenantId,
        _order_id: dbOrder.id,
        _warehouse_id: warehouseId,
        _request_key: `delivery:${dbOrder.id}`,
        _acceptance: {
          recipientName: acceptance.recipientName || targetOrder.customer || "",
          documentNo: acceptance.documentNo || "",
          warehouseEmployeeName: acceptance.warehouseEmployeeName || "",
          signatureConfirmed: Boolean(acceptance.signatureConfirmed),
          note: acceptance.note || "",
        },
      });
      if (error) {
        console.error("[delivery] stock fulfillment failed:", error);
        notify(describeStockError(error, "Təhvil tamamlanmadı"), "warning");
        return;
      }
      if (!isCurrentDelivery()) return;
      try {
        await refreshDbOrders();
        await dbInventory.refresh();
        if (isCurrentDelivery()) notify("Təhvil və anbar əməliyyatları serverdə tamamlandı.");
      } catch (refreshError) {
        if (isCurrentDelivery()) notify("Təhvil serverdə saxlanıldı, ekran yenilənmədi. Səhifəni yeniləyin.", "warning");
        console.error("[delivery] committed delivery refresh failed:", refreshError);
      }
      return;
    }

    setState((current) => {
      const order = current.orders.find((item) => item.id === orderId);
      if (!order || order.status === "Təhvil verilib" || !Array.isArray(order.productLines)) {
        return current;
      }

      const warehouseId = order.warehouseId || current.warehouses?.[0]?.id;
      const stockCheck = getDeliveryStockCheck({ ...order, warehouseId }, current.warehouseStock);
      if (!stockCheck.ok) {
        return appendAudit(current, {
          module: "Təhvil/Anbar",
          action: "Təhvil bloklandı",
          detail: `${orderId} · ${stockCheck.reason}`,
          status: "Bloklandı",
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        });
      }

      const plan = stockCheck.plan || getDeliveryPlan({ ...order, warehouseId }, current.warehouseStock);
      const deliverableLines = plan.lines.filter((line) => line.deliverable > 0);
      if (deliverableLines.length === 0) return current;

      const quantities = buildQuantityMap(
        deliverableLines.map((line) => ({ product: line.product, qty: line.deliverable })),
      );
      const serialLines = deliverableLines.map((line) => ({ product: line.product, qty: line.deliverable }));
      const nextWarehouseStock =
        warehouseId && current.warehouseStock?.[warehouseId]
          ? {
              ...current.warehouseStock,
              [warehouseId]: updateSerialStatuses(
                adjustStockRows(current.warehouseStock[warehouseId], quantities, {
                  totalDelta: -1,
                  reservedDelta: -1,
                }),
                serialLines,
                "Satılıb",
                orderId,
              ),
            }
          : current.warehouseStock;

      const nextDelivered = {};
      plan.lines.forEach((line) => {
        nextDelivered[line.product] = line.delivered + line.deliverable;
      });
      const fullyDelivered = plan.lines.every((line) => line.delivered + line.deliverable >= line.ordered);
      const deliveredNow = deliverableLines.reduce((sum, line) => sum + line.deliverable, 0);
      const remainingAfter = plan.remainingTotal - deliveredNow;

      return appendAudit(
        {
          ...current,
          warehouseStock: nextWarehouseStock,
          stock: adjustStockRows(current.stock, quantities, {
            totalDelta: -1,
            reservedDelta: -1,
          }),
          orders: current.orders.map((item) =>
            item.id === orderId
              ? {
                  ...item,
                  deliveredQuantities: nextDelivered,
                  status: fullyDelivered ? "Təhvil verilib" : item.status,
                  deliveryStatus: fullyDelivered
                    ? "Təhvil verildi"
                    : `Qismən təhvil (${plan.deliveredTotal + deliveredNow}/${plan.orderedTotal})`,
                  deliveredAt: formatPaymentDate(parsePaymentDate(baseDeliveryDate)),
                  deliveredBy: currentUser?.name || currentUser?.email || "System",
                  deliveryAcceptance: {
                    recipientName: acceptance.recipientName || order.customer,
                    documentNo: acceptance.documentNo || "",
                    warehouseEmployeeName: acceptance.warehouseEmployeeName || "",
                    signatureConfirmed: Boolean(acceptance.signatureConfirmed),
                    note: acceptance.note || "",
                    acceptedAt: new Date().toISOString(),
                  },
                }
              : item,
          ),
        },
        {
          module: "Təhvil/Anbar",
          action: fullyDelivered ? "Təhvil tamamlandı" : "Qismən təhvil",
          detail: `${orderId} · ${summarizeOrderProducts(order)} · ${deliveredNow} ədəd anbardan çıxıldı · Təhvil alan: ${acceptance.recipientName || order.customer}${
            fullyDelivered ? "" : ` · ${remainingAfter} ədəd backorder qalır`
          }`,
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        },
      );
    });

    if (deliveryWillComplete && activeTenantId) {
      await Promise.all([refreshDbOrders(), dbInventory.refresh()]);
    }

    const resultPlan = initialCheck.plan;
    if (resultPlan && resultPlan.shortageTotal > 0) {
      notify(
        `${orderId}: ${resultPlan.deliverableTotal} ədəd təhvil verildi, ${resultPlan.shortageTotal} ədəd backorder olaraq qaldı.`,
        "warning",
      );
    } else {
      notify(`${orderId} təhvil verildi və məhsul anbardan çıxıldı.`, "success");
    }
  }

function transferWarehouseStock({ fromWarehouseId, toWarehouseId, product, qty }) {
    if (!requirePermission("warehouse.manage", "anbar transferi etmək")) return;

    const amount = Math.max(1, Math.round(Number(qty || 0)));
    const fromRows = state.warehouseStock[fromWarehouseId] || [];
    const sourceItem = fromRows.find((item) => item.product === product);
    const available = sourceItem ? getAvailableQuantity(sourceItem) : 0;

    if (!sourceItem || !toWarehouseId || fromWarehouseId === toWarehouseId || available < amount) {
      notify("Transfer üçün kifayət qədər satış qalığı yoxdur.", "warning");
      return;
    }

    setState((current) => {
      const sourceRows = current.warehouseStock[fromWarehouseId] || [];
      const targetRows = current.warehouseStock[toWarehouseId] || [];
      const latestSource = sourceRows.find((item) => item.product === product);
      const latestAvailable = latestSource ? getAvailableQuantity(latestSource) : 0;

      if (!latestSource || latestAvailable < amount) return current;

      const nextSourceRows = sourceRows.map((item) =>
        item.product === product ? { ...item, total: Math.max(item.reserved, Number(item.total || 0) - amount) } : item,
      );
      const targetHasProduct = targetRows.some((item) => item.product === product);
      const nextTargetRows = targetHasProduct
        ? targetRows.map((item) =>
            item.product === product ? { ...item, total: Number(item.total || 0) + amount } : item,
          )
        : [
            ...targetRows,
            {
              product,
              total: amount,
              reserved: 0,
              price: Number(latestSource.price || 0),
            },
          ];

      return {
        ...current,
        warehouseStock: {
          ...current.warehouseStock,
          [fromWarehouseId]: nextSourceRows,
          [toWarehouseId]: nextTargetRows,
        },
      };
    });

    const sourceName = state.warehouses.find((warehouse) => warehouse.id === fromWarehouseId)?.name || fromWarehouseId;
    const targetName = state.warehouses.find((warehouse) => warehouse.id === toWarehouseId)?.name || toWarehouseId;
    notify(`${product}: ${amount} ədəd ${sourceName} → ${targetName} transfer edildi.`, "success");
    auditOperation({
      module: "Anbar",
      action: "Stok transfer edildi",
      detail: `${product}: ${amount} ədəd ${sourceName} → ${targetName}`,
    });
  }
return { updateWarehouse, recordStockIntake, importWarehouseStock, deleteWarehouse, completeWarehouseDelivery, transferWarehouseStock };
}
