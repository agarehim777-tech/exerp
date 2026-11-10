// Focused domain commands; dependencies are explicit and supplied by App.
export function createRecordCreationActions({ ENABLE_LEGACY_WRITES, activeTenantId, adjustStockRows, appConfirm, auditCurrentState, auditOperation, beginTenantRequest, buildCreditPlan, buildQuantityMap, buildSellerBonusRows, createDbCustomer, createDbOrder, createDbProduct, createIdempotencyKey, creditRecords, currentBusinessDate, dbCustomers, dbOrders, dbProducts, describeStockError, getCreateAudit, getEmployeeKey, getFreeQuantity, hasCreatePermission, isStockShortageError, nextContractNumber, nextSalesOrderNumber, normalize, normalizeVendor, notify, readSaleStockShortages, resolveOrderCustomer, serializeOrderNotes, setModal, setSelectedWarehouseId, setState, state, toLocalIsoDate, updateSerialStatuses, uploadDbProductImage }) {
async function createRecord(type, values) {
    if (!hasCreatePermission(type, values)) return false;

    if (type === "sales" || type === "dashboard") {
      const warehouseId = values.warehouseId || state.warehouses[0]?.id;
      const productLines = (Array.isArray(values.products) ? values.products : [])
        .filter((item) => item.product)
        .map((item) => ({ product: item.product, qty: Number(item.qty || 0) }));
      const invalidQtyLine = productLines.some((line) => line.qty <= 0);

      if (
        !values.customer ||
        !warehouseId ||
        productLines.length === 0 ||
        invalidQtyLine ||
        Number(values.orderTotal || 0) <= 0
      ) {
        notify("Sifariş üçün müştəri, anbar və ən azı bir məhsul (say > 0) seçin.", "warning");
        return;
      }

      let shortageLines;
      if (activeTenantId) {
        const isCurrent = beginTenantRequest('sale-stock-preview');
        try {
          const shortages = await readSaleStockShortages(activeTenantId, warehouseId, productLines, dbProducts || [], isCurrent);
          if (!isCurrent() || shortages === null) return false;
          shortageLines = shortages.map(line => `${line.product} (${line.shortage} ədəd)`);
        } catch (error) {
          if (isCurrent()) notify(`Qalıq serverdən yoxlanılmadı: ${error.message}`, 'error');
          return false;
        }
      } else if (ENABLE_LEGACY_WRITES) {
        const warehouseRows = state.warehouseStock?.[warehouseId] || [];
        shortageLines = productLines.map(line => {
          const item = warehouseRows.find(row => row.product === line.product);
          const shortage = Math.max(0, line.qty - (item ? getFreeQuantity(item) : 0));
          return shortage > 0 ? `${line.product} (${shortage} ədəd)` : null;
        }).filter(Boolean);
      } else {
        notify('Aktiv şirkət seçilməyib.', 'error');
        return false;
      }

      if (shortageLines.length > 0) {
        // Rezervasiya mümkün deyil — istifadəçidən açıq təsdiq alınmadan sifariş yaradılmır.
        const confirmed = await appConfirm(
          `Qalıq çatışmazlığı: ${shortageLines.join(", ")}.\n\n` +
            "Bu sətirlər rezerv edilə bilməyəcək və sifariş backorder (mənfi mövcud) kimi qeyd olunacaq.\n\n" +
            "Davam edilsin?",
        );
        if (!confirmed) {
          notify(
            `Sifariş bloklandı — rezervasiya üçün qalıq çatışmır: ${shortageLines.join(", ")}.`,
            "warning",
          );
          auditOperation({
            module: "Satış/Anbar",
            action: "Rezervasiya bloklandı",
            detail: `${values.customer || "—"} · ${shortageLines.join(", ")}`,
            status: "Bloklandı",
          });
          return;
        }
        notify(
          `Qalıq çatışmır — sifariş backorder kimi yaradıldı: ${shortageLines.join(", ")}. Təchizatdan gətirilib təhvil verilməlidir.`,
          "warning",
        );
      }

      // Persist to DB (Supabase). Realtime bridge will merge into state.orders.
      if (activeTenantId && createDbOrder) {
        const customerRow = resolveOrderCustomer(
          { customerId: values.customerId, fin: values.fin, name: values.customer },
          dbCustomers || [],
        );
        if (!customerRow) {
          notify("Müştəri dəqiq müəyyən edilmədi (tapılmadı və ya eyni adlı bir neçə müştəri var). Müştərini siyahıdan yenidən seçin.", "warning");
          return false;
        }
        const productsBySku = new Map(
          (dbProducts || []).map((p) => [String(p.sku || "").toLowerCase(), p]),
        );
        const productsByName = new Map(
          (dbProducts || []).map((p) => [String(p.name || "").toLowerCase(), p]),
        );
        const orderProducts = Array.isArray(values.products) ? values.products : [];
        const items = orderProducts
          .filter((it) => it.product)
          .map((it, idx) => {
            const key = String(it.product || "").toLowerCase();
            const prod = productsBySku.get(key) || productsByName.get(key) || null;
            const qty = Number(it.qty || 0);
            const unitPrice = Number(it.price || prod?.price || 0);
            // Rezerv həmişə yaradılır: məhsul DB-də tanınırsa və anbar UUID-dirsə,
            // sətir anbarın təhvil növbəsinə düşür (qalıq çatmasa belə backorder rezervi).
            const isUuidWarehouse = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              String(warehouseId || ""),
            );
            return {
              line_no: idx + 1,
              product_id: prod?.id || null,
              description: it.product,
              qty,
              unit_price: unitPrice,
              discount_pct: 0,
              vat_rate: Number(it.vatRate ?? 0),
              warehouse_id: prod?.id && isUuidWarehouse ? warehouseId : null,
            };
          });
        const orderNo = nextSalesOrderNumber(dbOrders);
        const savedOrder = await createDbOrder({
          request_key: createIdempotencyKey("sales-order"),
          order_no: orderNo,
          customer_id: customerRow.id,
          order_date: values.date || toLocalIsoDate(),
          // Satış ayrıca təsdiq mərhələsi gözləmir. Yaradılan kimi anbarın
          // təhvil növbəsinə düşən təsdiqli sifariş kimi saxlanılır.
          status: "confirmed",
          currency: "AZN",
          notes: serializeOrderNotes(values.note, values.internalNotes),
          bonus_allocations: buildSellerBonusRows(values.sellers).map((row) => ({
            seller_name: row.seller,
            rate: Number(row.bonus || 0),
          })),
          items,
          credit: values.paymentMethod === "Kredit"
            ? {
                contract_no: nextContractNumber({
                  contracts: state.contracts,
                  orders: state.orders,
                  credits: creditRecords,
                }),
                principal: Number(values.orderTotal || 0),
                initial_payment: Number(values.depositPaid ?? values.initialPayment ?? 0),
                required_initial: Number(values.initialPayment || 0),
                term_months: Number(values.creditMonths || 12),
                start_date: values.date || toLocalIsoDate(),
              }
            : null,
        }).catch((err) => {
          console.error("[orders] DB insert failed:", err);
          notify(describeStockError(err, "DB-yə saxlanılmadı"), "warning");
          if (isStockShortageError(err)) {
            auditOperation({
              module: "Satış/Anbar",
              action: "Rezervasiya bloklandı",
              detail: `${values.customer || "—"} · server rezervasiyanı rədd etdi`,
              status: "Bloklandı",
            });
          }
          return null;
        });
        if (!savedOrder) return false;
        setModal(null);
        notify("Yeni qeyd əlavə olundu.");
        auditOperation(getCreateAudit(type, values));
        return true;
      }
    }

    if (type === "warehouse") {
      const id = `WH-${Date.now()}`;
      const warehouse = {
        id,
        code: values.code || `ANB-${state.warehouses.length + 1}`,
        name: values.name,
        city: values.city,
        address: values.address,
        manager: values.manager,
        type: values.type,
        capacity: Number(values.capacity || 0),
        status: values.status || "Aktiv",
      };
      setState((current) => ({
        ...current,
        warehouses: [warehouse, ...current.warehouses],
        warehouseStock: {
          ...current.warehouseStock,
          [id]: [],
        },
      }));
      setSelectedWarehouseId(id);
      setModal(null);
      notify("Yeni anbar yaradıldı.");
      auditOperation({
        module: "Anbar",
        action: "Anbar yaradıldı",
        detail: `${warehouse.name} (${warehouse.code})`,
      });
      return;
    }

    if (type === "product") {
      const name = String(values.name || "").trim();
      const sku = String(values.sku || "").trim().toUpperCase();
      if (!name || !sku) {
        notify("Məhsul adı və SKU daxil edin.", "warning");
        return;
      }
      if (state.products.some((product) => normalize(product.sku) === normalize(sku))) {
        notify("Bu SKU artıq məhsul kataloqunda var.", "warning");
        return;
      }
      let persistedProduct = null;
      if (activeTenantId && createDbProduct) {
        try {
          persistedProduct = await createDbProduct({
            sku,
            name,
            description: values.category || null,
            unit: values.unit || "ədəd",
            price: Math.max(0, Number(values.salePrice || 0)),
            minimum_stock: Math.max(0, Math.round(Number(values.reorderLevel || 0))),
            recommended_order_qty: Math.max(0, Math.round(Number(values.recommendedOrderQty || 0))),
            currency: "AZN",
            vat_rate: 18,
            is_active: true,
          });
          if (values.imageFile && uploadDbProductImage) {
            persistedProduct = await uploadDbProductImage(persistedProduct.id, values.imageFile);
          }
        } catch (err) {
          console.error("[products] DB insert failed:", err);
          notify(`Məhsul DB-yə saxlanılmadı: ${err.message || err}`, "warning");
          return;
        }
      }
      const product = {
        id: persistedProduct?.id || `PRD-${Date.now()}`,
        name,
        sku,
        category: values.category || "Digər",
        unit: values.unit || "ədəd",
        salePrice: Math.max(0, Number(values.salePrice || 0)),
        costPrice: Math.max(0, Number(values.costPrice || 0)),
        reorderLevel: Math.max(0, Math.round(Number(values.reorderLevel || 0))),
        recommendedOrderQty: Math.max(0, Math.round(Number(values.recommendedOrderQty || 0))),
        serialTracked: values.serialTracked === "Bəli",
        status: "Aktiv",
        imagePath: persistedProduct?.image_path || "",
        imageUrl: persistedProduct?.image_url || "",
      };
      setState((current) =>
        auditCurrentState(
          { ...current, products: [product, ...(current.products || [])] },
          getCreateAudit("product", product),
        ),
      );
      setModal(null);
      notify(`${product.name} məhsul kataloquna əlavə edildi.`);
      return;
    }

    if (type === "crm" && activeTenantId && createDbCustomer && values.name) {
      createDbCustomer({
        name: String(values.name).trim(),
        phone: values.phone || null,
        tax_id: values.fin || null,
        notes: values.category ? `Kateqoriya: ${values.category}` : null,
      }).catch((err) => {
        console.error("[customers] DB insert failed:", err);
        notify(`Müştəri DB-yə saxlanılmadı: ${err.message || err}`, "warning");
      });
    }

    setState((current) => {
      if (type === "crm") {
        return {
          ...current,
          customers: [
            {
              fin: values.fin || `FIN${current.customers.length + 1}`,
              name: values.name,
              phone: values.phone,
              category: values.category,
              limit: Number(values.limit || 0),
              debt: Number(values.debt || 0),
              delay: 0,
            },
            ...current.customers,
          ],
        };
      }

      if (type === "sales" || type === "dashboard") {
        const nextId = `SF-${Date.now()}`;
        const orderProducts = Array.isArray(values.products) ? values.products : [];
        const orderSellers = Array.isArray(values.sellers) ? values.sellers : [];
        const amount = Number(values.orderTotal ?? values.amount ?? 0);
        const paymentMethod = values.paymentMethod || "Nağd";
        const isCreditSale = paymentMethod === "Kredit";
        const creditPlan = isCreditSale
          ? buildCreditPlan({
              total: amount,
              initialPayment: values.initialPayment,
              months: values.creditMonths,
            })
          : null;
        const depositPaid = isCreditSale
          ? Math.min(Number(values.depositPaid ?? creditPlan.initialPayment ?? 0), creditPlan.initialPayment)
          : 0;
        const paid = isCreditSale
          ? depositPaid
          : ["Nağd", "Kart", "Köçürmə"].includes(paymentMethod)
            ? amount
            : 0;
        const creditId = isCreditSale ? `KR-${String(nextId).replace(/\D/g, "")}` : null;
        const contractId = isCreditSale ? nextContractNumber(current) : null;
        const warehouseId = values.warehouseId || current.warehouses?.[0]?.id;
        const warehouseName =
          current.warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || "Baş Anbar";
        const productLines = orderProducts
          .filter((item) => item.product)
          .map((item) => ({
            product: item.product,
            qty: Number(item.qty || 0),
            price: Number(item.price || 0),
            serials: Array.isArray(item.serials) ? item.serials.filter(Boolean) : [],
          }));
        const productSummary = orderProducts
          .filter((item) => item.product)
          .map((item) => `${item.product}${Number(item.qty) > 1 ? ` x${Number(item.qty)}` : ""}`)
          .join(", ");
        const sellerSummary = orderSellers
          .filter((item) => item.seller)
          .map((item) => `${item.seller} ${Number(item.bonus || 0)}%`)
          .join(", ");
        const sellerBonuses = orderSellers
          .filter((item) => item.seller)
          .map((item) => ({
            seller: item.seller,
            bonus: Number(item.bonus || 0),
          }));
        const reservedByProduct = buildQuantityMap(productLines);
        const nextWarehouseStock =
          warehouseId && current.warehouseStock?.[warehouseId]
            ? {
                ...current.warehouseStock,
                [warehouseId]: updateSerialStatuses(
                  adjustStockRows(current.warehouseStock[warehouseId], reservedByProduct, {
                    reservedDelta: 1,
                    createMissing: true,
                  }),
                  productLines,
                  "Rezervdə",
                  nextId,
                ),
              }
            : current.warehouseStock;
        return {
          ...current,
          warehouseStock: nextWarehouseStock,
          stock: adjustStockRows(current.stock, reservedByProduct, { reservedDelta: 1, createMissing: true }),
          credits: isCreditSale
            ? [
                {
                  id: creditId,
                  customer: values.customer,
                  fin: values.fin || "Yeni FİN",
                  orderId: nextId,
                  contractId,
                  product: productSummary,
                  device: productSummary,
                  total: amount,
                  initialPayment: creditPlan.initialPayment,
                  requiredInitial: creditPlan.initialPayment,
                  initialPaid: depositPaid,
                  balance: creditPlan.balance,
                  monthly: creditPlan.monthly,
                  lastPayment: creditPlan.lastPayment,
                  months: creditPlan.months,
                  paidMonths: 0,
                  rate: 0,
                  next: "—",
                  status: "Başlanmamış",
                  installments: creditPlan.installments,
                  createdFrom: "Satış sifarişi",
                },
                ...current.credits,
              ]
            : current.credits,
          orders: [
            {
              id: nextId,
              customer: values.customer,
              fin: values.fin || "Yeni FİN",
              products: productSummary || values.products,
              productLines,
              seller: sellerSummary || values.seller || "Təyin edilməyib",
              sellerBonuses,
              amount,
              paid,
              status: values.status || "Anbardadır",
              date: values.date || currentBusinessDate,
              address: values.address || "Qeyd edilməyib",
              driver: "—",
              warehouseId,
              warehouseName,
              paymentMethod,
              paymentStatus: paymentMethod === "Kredit" ? "Kredit satış" : "Ödənilib",
              creditId,
              contractId,
              creditMonths: creditPlan?.months || null,
              initialPayment: creditPlan?.initialPayment || 0,
              requiredInitial: creditPlan?.initialPayment || 0,
              initialPaid: isCreditSale ? depositPaid : 0,
              creditBalance: creditPlan?.balance || 0,
              creditMonthly: creditPlan?.monthly || 0,
              creditLastPayment: creditPlan?.lastPayment || 0,
              deliveryStatus: "Təhvil gözləyir",
              note: serializeOrderNotes(values.note, values.internalNotes) || "",
              bonusTotal: Number(values.bonusTotal || 0),
            },
            ...current.orders,
          ],
          contracts: isCreditSale
            ? [
                {
                  id: contractId,
                  customer: values.customer,
                  fin: values.fin || "Yeni FİN",
                  product: productSummary,
                  amount,
                  status: "Hazırlanır",
                  orderId: nextId,
                },
                ...current.contracts,
              ]
            : current.contracts,
        };
      }

      if (type === "finance") {
        return {
          ...current,
          expenses: [
            {
              id: `MX-${Date.now()}`,
              description: values.description,
              category: values.category,
              date: values.date || currentBusinessDate,

              amount: Number(values.amount || 0),
              status: "Təsdiq gözləyir",
            },
            ...current.expenses,
          ],
        };
      }

      if (type === "credits") {
        const creditPlan = buildCreditPlan({
          total: values.total,
          initialPayment: values.initialPayment,
          months: values.months,
        });
        return {
          ...current,
          credits: [
            {
              id: `KR-${Date.now()}`,
              customer: values.customer,
              contractId: nextContractNumber(current),
              product: values.product,
              device: values.product,
              total: creditPlan.total,
              initialPayment: creditPlan.initialPayment,
              balance: creditPlan.balance,
              monthly: creditPlan.monthly,
              lastPayment: creditPlan.lastPayment,
              months: creditPlan.months,
              paidMonths: 0,
              rate: 0,
              next: values.next || creditPlan.installments[0]?.due || "—",
              status: "Aktiv",
              installments: creditPlan.installments,
            },
            ...current.credits,
          ],
        };
      }

      if (type === "vendors") {
        const vendor = normalizeVendor(values);
        if (!vendor.name || !vendor.country) return current;
        return {
          ...current,
          vendors: [vendor, ...current.vendors],
        };
      }

      if (type === "hr") {
        const manager = current.employees.find(
          (employee) => getEmployeeKey(employee) === values.managerId || employee.name === values.managerName,
        );
        const documentsComplete = Math.max(0, Math.min(100, Number(values.documentsComplete ?? 100)));
        const documentReviewRequired = documentsComplete < 100;
        return {
          ...current,
          employees: [
            {
              id: `EMP-${Date.now()}`,
              initials: values.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toLocaleUpperCase("az-AZ"),
              name: values.name,
              position: values.position,
              department: values.department,
              departmentParent: values.departmentParent || "",
              managerId: manager ? getEmployeeKey(manager) : "",
              managerName: manager?.name || values.managerName || "",
              level: values.level || "Komanda üzvü",
              salary: Number(values.salary || 0),
              kpi: Number(values.kpi || 85),
              hireDate: values.hireDate || currentBusinessDate,
              workMode: values.workMode || "Ofis",
              shift: values.shift || "09:00-18:00",
              employmentType: values.employmentType || "Tam ştat",
              leaveBalance: Math.max(0, Number(values.leaveBalance || 0)),
              usedLeave: 0,
              documentsComplete,
              hrStatus: documentReviewRequired ? "Məlumat gözləyir" : "Stabil",
              documentReviewRequired,
              skills: String(values.skills || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            },
            ...current.employees,
          ],
        };
      }

      if (type === "contracts") {
        return {
          ...current,
          contracts: [
            {
              id: nextContractNumber(current),
              customer: values.customer,
              fin: values.fin || "Yeni FİN",
              product: values.product,
              amount: Number(values.amount || 0),
              status: "Hazırlanır",
            },
            ...current.contracts,
          ],
        };
      }

      return current;
    });
    setModal(null);
    notify("Yeni qeyd əlavə olundu.");
    auditOperation(getCreateAudit(type, values));
    return true;
  }
return { createRecord };
}
