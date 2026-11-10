// Focused domain commands; dependencies are explicit and supplied by App.
export function createProductCatalogActions({ activeTenantId, appConfirm, auditCurrentState, dbProducts, deleteDbProduct, ensureStockItemSerials, normalize, notify, removeDbProductImage, requirePermission, setModal, setState, state, updateDbProduct, uploadDbProductImage, warehouseId, wid }) {
async function updateProduct(productId, values) {
    if (!requirePermission("warehouse.manage", "məhsul kataloqunu redaktə etmək")) return;

    const currentProduct = state.products.find((product) => product.id === productId);
    const name = String(values.name || "").trim();
    const sku = String(values.sku || "").trim().toUpperCase();
    if (!currentProduct || !name || !sku) {
      notify("Məhsul adı və SKU daxil edin.", "warning");
      return;
    }
    if (state.products.some((product) => product.id !== productId && normalize(product.sku) === normalize(sku))) {
      notify("Bu SKU artıq məhsul kataloqunda var.", "warning");
      return;
    }

    const nextProduct = {
      ...currentProduct,
      name,
      sku,
      category: values.category || "Digər",
      unit: values.unit || "ədəd",
      salePrice: Math.max(0, Number(values.salePrice || 0)),
      costPrice: Math.max(0, Number(values.costPrice || 0)),
      reorderLevel: Math.max(0, Math.round(Number(values.reorderLevel || 0))),
      recommendedOrderQty: Math.max(0, Math.round(Number(values.recommendedOrderQty || 0))),
      serialTracked: values.serialTracked === "Bəli",
      imageUrl: values.removeImage ? "" : values.imagePreview || currentProduct.imageUrl || "",
      imagePath: values.removeImage ? "" : currentProduct.imagePath || "",
    };

    const dbRow =
      (dbProducts || []).find((p) => p.id === productId) ||
      (dbProducts || []).find((p) => String(p.sku).toLowerCase() === String(currentProduct.sku).toLowerCase());
    if (activeTenantId && dbRow) {
      try {
        let persisted = await updateDbProduct(dbRow.id, {
          sku: nextProduct.sku,
          name: nextProduct.name,
          description: nextProduct.category || null,
          unit: nextProduct.unit,
          price: nextProduct.salePrice,
          minimum_stock: nextProduct.reorderLevel,
          recommended_order_qty: nextProduct.recommendedOrderQty,
        });
        if (values.imageFile && uploadDbProductImage) {
          persisted = await uploadDbProductImage(dbRow.id, values.imageFile, dbRow.image_path || currentProduct.imagePath || "");
        } else if (values.removeImage && removeDbProductImage) {
          persisted = await removeDbProductImage(dbRow.id, dbRow.image_path || currentProduct.imagePath || "");
        }
        nextProduct.imagePath = persisted?.image_path || "";
        nextProduct.imageUrl = persisted?.image_url || "";
      } catch (err) {
        console.error("[products] DB update failed:", err);
        notify(`Məhsul DB-də yenilənmədi: ${err.message || err}`, "warning");
        return;
      }
    }
    setState((current) => {
      const renameStockItem = (item, warehouseId = "") => {
        if (item.product !== currentProduct.name) return item;
        const nextItem = {
          ...item,
          product: nextProduct.name,
          price: nextProduct.salePrice || item.price,
          serialTracked: nextProduct.serialTracked,
          reorderLevel: nextProduct.reorderLevel,
        };
        return {
          ...nextItem,
          serials: ensureStockItemSerials(nextItem, warehouseId).serials,
        };
      };
      const warehouseStock = Object.fromEntries(
        Object.entries(current.warehouseStock || {}).map(([warehouseId, rows]) => [
          warehouseId,
          (rows || []).map((item) => renameStockItem(item, warehouseId)),
        ]),
      );
      return auditCurrentState(
        {
          ...current,
          products: current.products.map((product) => (product.id === productId ? nextProduct : product)),
          stock: current.stock.map((item) => renameStockItem(item)),
          warehouseStock,
        },
        {
          module: "Məhsul",
          action: "Məhsul redaktə edildi",
          detail: `${nextProduct.sku} · ${nextProduct.name}`,
        },
      );
    });
    setModal(null);
    notify(`${nextProduct.name} məhsul məlumatları yeniləndi.`);
  }

async function deleteProduct(productId) {
    if (!requirePermission("warehouse.manage", "məhsul kataloqunu silmək")) return;
    const currentProduct = state.products.find((product) => product.id === productId);
    if (!currentProduct) {
      notify("Məhsul tapılmadı.", "warning");
      return;
    }
    if (!(await appConfirm(`${currentProduct.name} məhsulunu silmək istədiyinizə əminsiniz?`, { danger: true }))) return;

    // Optimistic local removal + related stock cleanup
    setState((current) => {
      const stripRows = (rows) => (rows || []).filter((row) => row.product !== currentProduct.name);
      const warehouseStock = Object.fromEntries(
        Object.entries(current.warehouseStock || {}).map(([wid, rows]) => [wid, stripRows(rows)]),
      );
      return auditCurrentState(
        {
          ...current,
          products: current.products.filter((p) => p.id !== productId),
          stock: stripRows(current.stock),
          warehouseStock,
        },
        { module: "Məhsul", action: "Məhsul silindi", detail: `${currentProduct.sku} · ${currentProduct.name}` },
      );
    });

    // Persist to DB
    if (activeTenantId && deleteDbProduct) {
      const dbRow =
        (dbProducts || []).find((p) => p.id === productId) ||
        (dbProducts || []).find((p) => String(p.sku).toLowerCase() === String(currentProduct.sku).toLowerCase());
      if (dbRow) {
        deleteDbProduct(dbRow.id).catch((err) => {
          notify(`Məhsul DB-dən silinmədi: ${err.message || err}`, "warning");
        });
      }
    }
    setModal(null);
    notify(`${currentProduct.name} silindi.`);
  }
return { updateProduct, deleteProduct };
}
