import { useEffect, useState } from "react";
import { Check, CircleAlert, CreditCard, Plus, Search, Trash2, Users, X } from "lucide-react";
import { stages } from "../../../data.js";
import { money } from "../../../services/format.js";
import { buildCreditPlan, creditTermOptions } from "../../../shared/lib/credit.js";
import {
  currentBusinessDate,
  getAvailableQuantity,
  getBackorderPlan,
  getOrderSellerBonuses,
  isSerialTrackedProduct,
  normalizeOrderProductLines,
} from "../../../shared/lib/appDomain.jsx";
import { createClientId } from "../../../shared/utils/id.js";
import { serializeOrderNotes } from "../../../shared/utils/orderNotes.js";
import { calculateOrderFinancials, calculateOrderLineTotal } from "../services/orderCalculations.js";

const MAX_TOTAL_BONUS_RATE = 3;

const maxBonusForRow = (rows, rowId) => Math.max(
  0,
  MAX_TOTAL_BONUS_RATE - rows.reduce(
    (sum, row) => row.id === rowId ? sum : sum + Number(row.bonus || 0),
    0,
  ),
);

const updateSellerRowWithLimit = (rows, rowId, field, value) => {
  if (field !== "bonus") {
    return rows.map((row) => row.id === rowId ? { ...row, [field]: value } : row);
  }
  const maximum = maxBonusForRow(rows, rowId);
  const nextValue = value === ""
    ? ""
    : Math.min(maximum, Math.max(0, Number(value) || 0));
  return rows.map((row) => row.id === rowId ? { ...row, bonus: nextValue } : row);
};

function getAvailableSerialsForProduct(warehouseStock = {}, warehouseId, product) {
  const item = (warehouseStock?.[warehouseId] || []).find((row) => row.product === product);
  if (!item || !isSerialTrackedProduct(item)) return [];
  return (item.serials || []).filter((serial) => serial.status === "Anbarda").map((serial) => serial.imei);
}

function SearchableOrderSelect({ value, options, onChange, placeholder, ariaLabel, disabled = false }) {
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label || "");
  const [open, setOpen] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("az");
  const visibleOptions = (normalizedQuery
    ? options.filter((option) => `${option.label} ${option.searchText || ""}`.toLocaleLowerCase("az").includes(normalizedQuery))
    : options).slice(0, 50);

  useEffect(() => {
    setQuery(selected?.label || "");
  }, [value, selected?.label]);

  const choose = (option) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <div className={`order-search-select ${disabled ? "disabled" : ""}`}>
      <Search size={16} aria-hidden="true" />
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && open && visibleOptions[0]) {
            event.preventDefault();
            choose(visibleOptions[0]);
          }
          if (event.key === "Escape") { setOpen(false); setQuery(selected?.label || ""); }
        }}
      />
      {open && !disabled && <div className="order-search-select-menu" role="listbox">
        {visibleOptions.length ? visibleOptions.map((option) => (
          <button type="button" role="option" aria-selected={option.value === value} key={option.value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
            <span><strong>{option.label}</strong>{option.subtitle && <small>{option.subtitle}</small>}</span>
            {option.value === value && <Check size={15} />}
          </button>
        )) : <div className="order-search-select-empty">Uyğun nəticə tapılmadı</div>}
        {options.length > 50 && !normalizedQuery && <div className="order-search-select-hint">Nəticələri azaltmaq üçün yazmağa başlayın</div>}
      </div>}
    </div>
  );
}

const getCustomerIdentity = (customer = {}) => {
  let meta = {};
  try {
    const prefix = "__crm_meta__:";
    if (String(customer.notes || "").startsWith(prefix)) meta = JSON.parse(String(customer.notes).slice(prefix.length));
  } catch { meta = {}; }
  return {
    value: meta.fin_code || customer.fin_code || customer.fin || customer.tax_id || customer.id || "",
    fin: meta.fin_code || customer.fin_code || customer.fin || "",
    identityCard: meta.identity_card_no || customer.identity_card_no || "",
  };
};

const customerSearchOptions = (customers) => customers.map((customer) => {
  const identity = getCustomerIdentity(customer);
  return ({
  value: identity.value,
  label: customer.name,
  subtitle: [customer.phone, identity.fin || customer.tax_id].filter(Boolean).join(" · ") || "Əlaqə məlumatı yoxdur",
  searchText: [customer.phone, identity.fin, customer.tax_id, customer.email, identity.identityCard].filter(Boolean).join(" "),
  });
});

const productSearchOptions = (items) => items.map((item) => ({
  value: item.product,
  label: item.product,
  subtitle: `${Math.max(0, Number(item.total || 0) - Number(item.reserved || 0))} satış üçün${item.sku ? ` · SKU: ${item.sku}` : ""}`,
  searchText: [item.sku, item.category].filter(Boolean).join(" "),
}));

const sellerSearchOptions = (sellers, currentSeller = "") => {
  const options = sellers.map((seller) => ({
    value: seller.name,
    label: seller.name,
    subtitle: seller.role || seller.email || "Satıcı",
    searchText: [seller.role, seller.email].filter(Boolean).join(" "),
  }));
  if (currentSeller && !options.some((option) => option.value === currentSeller)) {
    options.push({ value: currentSeller, label: currentSeller, subtitle: "Təyin edilmiş satıcı", searchText: "" });
  }
  return options;
};

export function SalesOperationModal({ order, orderOptions, onClose, onSubmit }) {
  const customers = orderOptions.customers || [];
  const stock = orderOptions.stock || [];
  const warehouses = orderOptions.warehouses || [];
  const warehouseStock = orderOptions.warehouseStock || {};
  const sellers = orderOptions.sellers || [];
  const delivered = order.status === "Təhvil verilib";
  const firstWarehouseId = order.warehouseId || warehouses[0]?.id || "";

  const getStockOptions = (targetWarehouseId) => {
    const rows = warehouseStock[targetWarehouseId]?.length ? warehouseStock[targetWarehouseId] : stock;
    const byProduct = new Map(rows.map((item) => [item.product, item]));
    (order.productLines || []).forEach((line) => {
      if (!byProduct.has(line.product)) {
        byProduct.set(line.product, {
          product: line.product,
          total: Number(line.qty || 0),
          reserved: Number(line.qty || 0),
          price: Number(line.price || 0),
        });
      }
    });
    return [...byProduct.values()];
  };

  const [warehouseId, setWarehouseId] = useState(firstWarehouseId);
  const availableStock = getStockOptions(warehouseId);
  const firstProduct = availableStock[0] || { product: "", price: 0 };
  const [customerFin, setCustomerFin] = useState(order.fin || getCustomerIdentity(customers[0]).value);
  const [customerName, setCustomerName] = useState(order.customer || customers.find((customer) => customer.fin === order.fin)?.name || "");
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod || "Nağd");
  const [creditMonths, setCreditMonths] = useState(order.creditMonths || 12);
  const [initialPayment, setInitialPayment] = useState(order.initialPayment ?? order.paid ?? 0);
  const [paid, setPaid] = useState(order.paid ?? order.amount ?? 0);
  const [amount, setAmount] = useState(order.amount ?? calculateOrderLineTotal(order.productLines || []));
  const [date, setDate] = useState(order.date || currentBusinessDate);
  const [status, setStatus] = useState(order.status || stages[0]);
  const [address, setAddress] = useState(order.address || "");
  const [note, setNote] = useState(order.note || "");
  const [productRows, setProductRows] = useState(() => {
    const rows = normalizeOrderProductLines(order.productLines || []);
    return (rows.length > 0 ? rows : [{ product: firstProduct.product, qty: 1, price: firstProduct.price }]).map((row) => ({
      id: createClientId(),
      ...row,
    }));
  });
  const [sellerRows, setSellerRows] = useState(() => {
    const rows = getOrderSellerBonuses(order);
    return (rows.length > 0 ? rows : [{ seller: "", bonus: 0 }]).map((row) => ({
      id: createClientId(),
      ...row,
    }));
  });

  const selectedCustomer = customers.find((customer) => getCustomerIdentity(customer).value === customerFin);
  const lineTotal = calculateOrderLineTotal(productRows);
  const paymentPreview = paymentMethod === "Kredit" ? Number(initialPayment || 0) : Number(paid || 0);
  const bonusRate = sellerRows.reduce((sum, row) => sum + Number(row.bonus || 0), 0);
  const bonusRateValid = bonusRate <= MAX_TOTAL_BONUS_RATE;
  const canSubmit = Boolean(customerName && warehouseId && productRows.some((row) => row.product) && Number(amount || 0) > 0 && bonusRateValid);

  function changeCustomer(fin) {
    const customer = customers.find((item) => getCustomerIdentity(item).value === fin);
    setCustomerFin(fin);
    if (customer) setCustomerName(customer.name);
  }

  function changeWarehouse(nextWarehouseId) {
    const nextStock = getStockOptions(nextWarehouseId);
    const nextFirst = nextStock[0] || { product: "", price: 0 };
    setWarehouseId(nextWarehouseId);
    setProductRows((rows) =>
      rows.map((row) => {
        const match = nextStock.find((item) => item.product === row.product) || nextFirst;
        return {
          ...row,
          product: match.product,
          price: match.price ?? row.price,
          serials: [],
        };
      }),
    );
  }

  function changeProduct(rowId, field, value) {
    setProductRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;
        if (field === "product") {
          const match = availableStock.find((item) => item.product === value);
          return { ...row, product: value, price: match?.price ?? row.price, serials: [] };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function addProductRow() {
    setProductRows((rows) => [
      ...rows,
      {
        id: createClientId(),
        product: firstProduct.product,
        qty: 1,
        price: firstProduct.price,
        serials: [],
      },
    ]);
  }

  function removeProductRow(rowId) {
    setProductRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function changeSeller(rowId, field, value) {
    setSellerRows((rows) => updateSellerRowWithLimit(rows, rowId, field, value));
  }

  function addSellerRow() {
    if (sellerRows.length >= 3) return;
    setSellerRows((rows) => [...rows, { id: createClientId(), seller: "", bonus: 0 }]);
  }

  function removeSellerRow(rowId) {
    setSellerRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function submit(event) {
    event.preventDefault();
    if (!bonusRateValid) return;
    if (!canSubmit) return;
    onSubmit({
      customer: customerName,
      fin: customerFin,
      warehouseId,
      productLines: productRows,
      sellers: sellerRows,
      amount: Number(amount || lineTotal),
      paid,
      paymentMethod,
      creditMonths,
      initialPayment,
      date,
      status,
      address,
      note,
      bonusTotal: (paymentPreview * bonusRate) / 100,
    });
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card order-modal-card">
        <div className="modal-head order-modal-head">
          <div>
            <h2>Satış əməliyyatını redaktə et</h2>
            <p>{order.id} üzrə müştəri, ödəniş, bonus və rezerv məlumatlarını yeniləyin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="order-modal-form">
          <section className="order-section">
            <label className="order-label">MÜŞTƏRİ VƏ ÖDƏNİŞ</label>
            <div className="order-two-col">
              <SearchableOrderSelect value={customerFin} options={customerSearchOptions(customers)} onChange={changeCustomer} placeholder="Müştəri axtarın..." ariaLabel="Müştəri axtar və seç" />
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option>Nağd</option>
                <option>Kart</option>
                <option>Köçürmə</option>
                <option>Kredit</option>
              </select>
            </div>
            <div className="order-two-col">
              <label className="order-sub-field">
                <span>Müştəri adı</span>
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </label>
              <label className="order-sub-field">
                <span>Tarix</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
            </div>
            <label className="order-sub-field">
              <span>ANBAR</span>
              <select value={warehouseId} onChange={(event) => changeWarehouse(event.target.value)} disabled={delivered}>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} — {warehouse.city}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label">MƏHSULLAR</span>
              <button type="button" className="secondary-btn" onClick={addProductRow} disabled={delivered}>
                <Plus size={16} />
                Sətr əlavə et
              </button>
            </div>
            <div className="order-lines">
              {productRows.map((row) => (
                <div className="order-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.product} options={productSearchOptions(availableStock)} onChange={(value) => changeProduct(row.id, "product", value)} placeholder="Məhsul və ya SKU axtarın..." ariaLabel="Məhsul axtar və seç" disabled={delivered} />
                  <input type="number" min="1" value={row.qty} onChange={(event) => changeProduct(row.id, "qty", event.target.value)} disabled={delivered} />
                  <input type="number" min="0" value={row.price} onChange={(event) => changeProduct(row.id, "price", event.target.value)} disabled={delivered} />
                  <button type="button" className="line-delete" onClick={() => removeProductRow(row.id)} disabled={delivered} aria-label="Məhsul sətrini sil">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <div className="order-total edit-order-total">
              <span>Sətir cəmi: {money(lineTotal)}</span>
              <label>
                <span>Yekun məbləğ</span>
                <input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
            </div>
          </section>

          {paymentMethod === "Kredit" ? (
            <section className="order-section credit-order-section">
              <span className="order-label">
                <CreditCard size={16} />
                KREDİT ŞƏRTLƏRİ
              </span>
              <div className="credit-order-grid">
                <label className="order-sub-field">
                  <span>Müddət</span>
                  <select value={creditMonths} onChange={(event) => setCreditMonths(Number(event.target.value))}>
                    {creditTermOptions.map((month) => (
                      <option key={month} value={month}>{month} ay</option>
                    ))}
                  </select>
                </label>
                <label className="order-sub-field">
                  <span>İlkin ödəniş</span>
                  <input type="number" min="0" max={amount} value={initialPayment} onChange={(event) => setInitialPayment(event.target.value)} />
                </label>
              </div>
            </section>
          ) : (
            <section className="order-section">
              <label className="order-sub-field">
                <span>Daxil olan</span>
                <input type="number" min="0" max={amount} value={paid} onChange={(event) => setPaid(event.target.value)} />
              </label>
            </section>
          )}

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label seller-title">
                <Users size={16} />
                SATICI BONUSLARI
              </span>
              <button type="button" className="secondary-btn" disabled={sellerRows.length >= 3} onClick={addSellerRow}>
                <Plus size={16} />
                Satıcı əlavə et
              </button>
            </div>
            <div className="order-lines">
              {sellerRows.map((row) => (
                <div className="seller-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.seller} options={sellerSearchOptions(sellers, row.seller)} onChange={(value) => changeSeller(row.id, "seller", value)} placeholder="Satıcı adı ilə axtarın..." ariaLabel="Satıcı axtar və seç" />
                  <label className="bonus-input">
                    <input type="number" min="0" max={maxBonusForRow(sellerRows, row.id)} step="0.01" value={row.bonus} onChange={(event) => changeSeller(row.id, "bonus", event.target.value)} />
                    <span>% bonus</span>
                  </label>
                  <button type="button" className="line-delete" onClick={() => removeSellerRow(row.id)} aria-label="Satıcı sətrini sil">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <p className={`bonus-note${bonusRateValid ? "" : " bonus-note--error"}`}>
              Toplam bonus: <strong>{bonusRate}%</strong> / maksimum <strong>{MAX_TOTAL_BONUS_RATE}%</strong>
            </p>
          </section>

          <section className="order-section">
            <div className="order-two-col">
              <label className="order-sub-field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {stages
                    .filter((stage) => delivered || stage !== "Təhvil verilib")
                    .map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                </select>
              </label>
              <label className="order-sub-field">
                <span>Ünvan</span>
                <input value={address} onChange={(event) => setAddress(event.target.value)} />
              </label>
            </div>
            <label className="order-sub-field">
              <span>Qeyd</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </section>

          <div className="modal-actions order-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn" disabled={!canSubmit}>Yadda saxla</button>
          </div>
        </form>
      </div>
    </div>
  );
}
export function SalesOrderModal({ type, onClose, onCreate, orderOptions, defaults = {} }) {
  const customers = orderOptions.customers;
  const stock = orderOptions.stock;
  const sellers = orderOptions.sellers;
  const warehouses = orderOptions.warehouses || [];
  const warehouseStock = orderOptions.warehouseStock || {};
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const availableStock = warehouseStock[warehouseId]?.length ? warehouseStock[warehouseId] : stock;
  const [customerFin, setCustomerFin] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(defaults.paymentMethod || "Nağd");
  const [creditMonths, setCreditMonths] = useState(12);
  const [initialPayment, setInitialPayment] = useState(0);
  const [depositPaid, setDepositPaid] = useState(0);

  const [productRows, setProductRows] = useState([
    {
      id: createClientId(),
      product: "",
      qty: 1,
      price: 0,
      vatRate: 0,
      serials: [],
    },
  ]);
  const [sellerRows, setSellerRows] = useState([
    { id: createClientId(), seller: "", bonus: 0 },
  ]);
  const [note, setNote] = useState("");
  const [internalNotes, setInternalNotes] = useState([
    { id: createClientId(), recipient: "Maliyyə", text: "" },
  ]);

  const selectedCustomer = customers.find((customer) => getCustomerIdentity(customer).value === customerFin);
  const { subtotal: orderSubtotal, vat: orderVat, total: orderTotal } = calculateOrderFinancials(productRows);
  const creditPlan = buildCreditPlan({
    total: orderTotal,
    initialPayment,
    months: creditMonths,
  });
  const depositNow = Math.min(Math.max(0, Number(depositPaid || 0)), Number(creditPlan.initialPayment || 0));
  const initialRemaining = Math.max(0, Number(creditPlan.initialPayment || 0) - depositNow);
  const paidAmount = paymentMethod === "Kredit" ? depositNow : orderTotal;
  const bonusRate = sellerRows.reduce((sum, item) => sum + Number(item.bonus || 0), 0);
  const bonusTotal = (paidAmount * bonusRate) / 100;
  const selectedSerials = productRows.flatMap((row) => row.serials || []);
  const backorderRows = productRows
    .filter((row) => row.product)
    .map((row) => {
      const item = availableStock.find((stockItem) => stockItem.product === row.product);
      const available = item ? getAvailableQuantity(item) : 0;
      const requested = Math.max(1, Number(row.qty || 1));
      if (available >= requested) return null;
      return {
        rowId: row.id,
        product: row.product,
        available,
        requested,
        plan: getBackorderPlan({
          product: row.product,
          missingQty: requested - available,
          purchaseOrders: orderOptions.purchaseOrders || [],
        }),
      };
    })
    .filter(Boolean);
  

  const bonusRateValid = bonusRate <= MAX_TOTAL_BONUS_RATE;
  const initialTargetRaw = Math.max(0, Number(initialPayment || 0));
  const depositRaw = Math.max(0, Number(depositPaid || 0));
  const creditValidationError =
    paymentMethod !== "Kredit"
      ? ""
      : initialTargetRaw > orderTotal
        ? `İlkin ödəniş hədəfi sifariş məbləğini aşır: maksimum ${money(orderTotal)}, daxil edilən ${money(initialTargetRaw)}.`
        : initialTargetRaw >= orderTotal && orderTotal > 0
          ? `İlkin ödəniş hədəfi sifariş məbləğindən az olmalıdır (maksimum ${money(Math.max(0, orderTotal - 1))}).`
          : depositRaw > initialTargetRaw
            ? `Beh ilkin ödəniş hədəfini aşır: hədəf ${money(initialTargetRaw)}, daxil edilən ${money(depositRaw)}.`
            : "";
  const canCreateOrder = Boolean(
    selectedCustomer &&
      warehouseId &&
      availableStock.length > 0 &&
      orderTotal > 0 &&
      productRows.some((row) => row.product) &&
      sellerRows.some((row) => row.seller) &&
      bonusRateValid &&
      !creditValidationError,
  );



  function getRowSerialOptions(row) {
    const allSerials = getAvailableSerialsForProduct(warehouseStock, warehouseId, row.product);
    const rowSerials = new Set(row.serials || []);
    const usedOutsideRow = new Set(selectedSerials.filter((serial) => !rowSerials.has(serial)));
    return allSerials.filter((serial) => !usedOutsideRow.has(serial) || rowSerials.has(serial));
  }

  function normalizeRowSerials(product, qty, currentSerials = []) {
    const amount = Math.max(1, Math.round(Number(qty || 1)));
    const options = getAvailableSerialsForProduct(warehouseStock, warehouseId, product);
    if (options.length === 0) return [];
    const next = [...currentSerials.filter((serial) => options.includes(serial))];

    for (const serial of options) {
      if (next.length >= amount) break;
      if (!selectedSerials.includes(serial) && !next.includes(serial)) next.push(serial);
    }

    return next.slice(0, amount);
  }

  function changeWarehouse(nextWarehouseId) {
    const nextStock = warehouseStock[nextWarehouseId]?.length
      ? warehouseStock[nextWarehouseId]
      : stock;
    setWarehouseId(nextWarehouseId);
    setProductRows((rows) =>
      rows.map((row) => {
        if (!row.product) return { ...row, product: "", price: 0, serials: [] };
        const match = nextStock.find((item) => item.product === row.product);
        return {
          ...row,
          product: match?.product || "",
          price: match?.price || 0,
          serials: match ? getAvailableSerialsForProduct(warehouseStock, nextWarehouseId, match.product).slice(0, Math.max(1, Number(row.qty || 1))) : [],
        };
      }),
    );
  }

  function changeProduct(rowId, field, value) {
    setProductRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;
        if (field === "product") {
          const match = availableStock.find((item) => item.product === value);
          return {
            ...row,
            product: value,
            price: match?.price || row.price,
            serials: normalizeRowSerials(value, row.qty, []),
          };
        }
        if (field === "qty") {
          return {
            ...row,
            qty: value,
            serials: normalizeRowSerials(row.product, value, row.serials),
          };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function changeRowSerial(rowId, index, value) {
    setProductRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;
        const serials = [...(row.serials || [])];
        serials[index] = value;
        return { ...row, serials };
      }),
    );
  }

  function addProductRow() {
    setProductRows((rows) => [
      ...rows,
      {
        id: createClientId(),
        product: "",
        qty: 1,
        price: 0,
        vatRate: 0,
        serials: [],
      },
    ]);
  }

  function removeProductRow(rowId) {
    setProductRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function changeSeller(rowId, field, value) {
    setSellerRows((rows) => updateSellerRowWithLimit(rows, rowId, field, value));
  }

  function addSellerRow() {
    if (sellerRows.length >= 3) return;
    setSellerRows((rows) => [
      ...rows,
      { id: createClientId(), seller: "", bonus: 0 },
    ]);
  }

  function removeSellerRow(rowId) {
    setSellerRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function submit(event) {
    event.preventDefault();
    if (!canCreateOrder || !bonusRateValid) return;
    onCreate(type, {
      customer: selectedCustomer?.name || "",
      fin: getCustomerIdentity(selectedCustomer).fin || selectedCustomer?.tax_id || "",
      paymentMethod,
      warehouseId,
      creditMonths,
      initialPayment,
      depositPaid: depositNow,
      products: productRows.map((row) => ({
        ...row,
        serials: normalizeRowSerials(row.product, row.qty, row.serials),
      })),
      sellers: sellerRows,
      orderTotal,
      bonusTotal,
      note,
      internalNotes,
    });
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card order-modal-card">
        <div className="modal-head order-modal-head">
          <div>
            <h2>Yeni Satış Sifarişi</h2>
            <p>Müştəri, məhsul və satıcı bonus faizlərini daxil edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="order-modal-form">
          <section className="order-section">
            <label className="order-label" htmlFor="order-customer">
              MÜŞTƏRİ
            </label>
            <div className="order-two-col">
              <SearchableOrderSelect value={customerFin} options={customerSearchOptions(customers)} onChange={setCustomerFin} placeholder="Ad, telefon, FİN və ya VÖEN ilə axtarın..." ariaLabel="Müştəri axtar və seç" />
              <select
                aria-label="Ödəniş tipi"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option>Nağd</option>
                <option>Kredit</option>
              </select>
            </div>
            <label className="order-sub-field">
              <span>ANBAR</span>
              <select
                aria-label="Rezerv anbarı"
                value={warehouseId}
                onChange={(event) => changeWarehouse(event.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} — {warehouse.city}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="order-section">
            <div className="section-title-row">
              <div>
                <span className="order-label">DAXİLİ QEYDLƏR</span>
                <small style={{ display: "block", marginTop: 4, color: "var(--muted)" }}>Qeydin kim üçün olduğunu seçin. Bu məlumat sifariş kartında saxlanacaq.</small>
              </div>
              <button type="button" className="secondary-btn" onClick={() => setInternalNotes((rows) => [...rows, { id: createClientId(), recipient: "Maliyyə", text: "" }])}>
                <Plus size={16} /> Qeyd əlavə et
              </button>
            </div>
            <div className="order-lines">
              {internalNotes.map((item) => (
                <div className="order-internal-note-line" key={item.id}>
                  <select value={item.recipient} onChange={(event) => setInternalNotes((rows) => rows.map((row) => row.id === item.id ? { ...row, recipient: event.target.value } : row))}>
                    <option>Maliyyə</option>
                    <option>Təhvil əməkdaşı</option>
                    <option>Anbar</option>
                    <option>Satış</option>
                    <option>Rəhbərlik</option>
                    <option>Ümumi</option>
                  </select>
                  <input value={item.text} onChange={(event) => setInternalNotes((rows) => rows.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row))} placeholder={`${item.recipient} üçün qeyd yazın…`} />
                  <button type="button" className="line-delete" onClick={() => setInternalNotes((rows) => rows.length === 1 ? rows.map((row) => ({ ...row, text: "" })) : rows.filter((row) => row.id !== item.id))} aria-label="Qeydi sil"><Trash2 size={17} /></button>
                </div>
              ))}
            </div>
          </section>

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label">MƏHSULLAR</span>
              <button type="button" className="secondary-btn" onClick={addProductRow}>
                <Plus size={16} />
                Sətr əlavə et
              </button>
            </div>
            <div className="order-lines">
              {productRows.map((row) => (
                <div className="order-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.product} options={productSearchOptions(availableStock)} onChange={(value) => changeProduct(row.id, "product", value)} placeholder="Məhsul adı və ya SKU..." ariaLabel="Məhsul axtar və seç" />
                  <input
                    aria-label="Miqdar"
                    type="number"
                    min="1"
                    value={row.qty}
                    onChange={(event) => changeProduct(row.id, "qty", event.target.value)}
                  />
                  <input
                    aria-label="Qiymət"
                    type="number"
                    min="0"
                    value={row.price}
                    onChange={(event) => changeProduct(row.id, "price", event.target.value)}
                  />
                  <select
                    aria-label="ƏDV seçimi"
                    value={row.vatRate || 0}
                    onChange={(event) => changeProduct(row.id, "vatRate", Number(event.target.value))}
                  >
                    <option value="0">ƏDV yoxdur</option>
                    <option value="18">ƏDV 18%</option>
                  </select>
                  <button
                    type="button"
                    className="line-delete"
                    onClick={() => removeProductRow(row.id)}
                    aria-label="Məhsul sətrini sil"
                  >
                    <Trash2 size={17} />
                  </button>
                  {getRowSerialOptions(row).length > 0 && (
                    <div className="serial-pick-list">
                      {Array.from({ length: Math.max(1, Number(row.qty || 1)) }).map((_, index) => (
                        <label key={`${row.id}-serial-${index}`}>
                          <span>IMEI #{index + 1}</span>
                          <select
                            value={row.serials?.[index] || ""}
                            onChange={(event) => changeRowSerial(row.id, index, event.target.value)}
                          >
                            <option value="">Serial seç</option>
                            {getRowSerialOptions(row).map((serial) => (
                              <option key={serial} value={serial}>
                                {serial}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="order-total">
              <span>Ara cəm: <b>{money(orderSubtotal)}</b></span>
              <span>ƏDV: <b>{money(orderVat)}</b></span>
              <strong>Ümumi: {money(orderTotal)}</strong>
            </div>
            {backorderRows.length > 0 && (
              <div className="order-backorder-box">
                <div className="order-stock-warning">
                  <CircleAlert size={16} />
                  <span>
                    Anbarda qalıq çatmır — sifariş yaradılır, çatışmayan hissə <strong>backorder</strong> kimi rezervdə
                    saxlanılır və aşağıdakı addımda bağlanır.
                  </span>
                </div>
                <ul className="order-backorder-list">
                  {backorderRows.map((row) => (
                    <li key={row.rowId}>
                      <strong>{row.product}</strong>
                      <span>
                        {row.available}/{row.requested} mövcud · {row.plan?.missingQty} ədəd backorder
                      </span>
                      {row.plan && (
                        <>
                          <em>
                            Gözlənilən bağlanma tarixi: <b>{row.plan.expectedLabel}</b>
                          </em>
                          <em>
                            Addım: <b>{row.plan.step}</b> → {row.plan.closeStage}
                          </em>
                          <small>{row.plan.stepHint}</small>
                          {row.plan.uncoveredQty > 0 && (
                            <small className="order-backorder-gap">
                              {row.plan.uncoveredQty} ədəd üçün hələ açıq PO yoxdur — satınalma tələbi yaradın.
                            </small>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}


          </section>

          {paymentMethod === "Kredit" && (
            <section className="order-section credit-order-section">
              <div className="section-title-row">
                <span className="order-label">
                  <CreditCard size={16} />
                  KREDİT ŞƏRTLƏRİ
                </span>
              </div>
              <div className="credit-order-grid">
                <label className="order-sub-field">
                  <span>MÜDDƏT</span>
                  <select
                    aria-label="Kredit müddəti"
                    value={creditMonths}
                    onChange={(event) => setCreditMonths(Number(event.target.value))}
                  >
                    {creditTermOptions.map((month) => (
                      <option key={month} value={month}>
                        {month} ay
                      </option>
                    ))}
                  </select>
                </label>
                <label className="order-sub-field">
                  <span>İLKİN ÖDƏNİŞ (HƏDƏF)</span>
                  <input
                    aria-label="İlkin ödəniş hədəfi"
                    type="number"
                    min="0"
                    max={orderTotal}
                    value={initialPayment}
                    onChange={(event) => setInitialPayment(event.target.value)}
                  />
                </label>
                <label className="order-sub-field">
                  <span>BEH (İNDİ ÖDƏNİLƏN)</span>
                  <input
                    aria-label="Beh məbləği"
                    type="number"
                    min="0"
                    max={Number(creditPlan.initialPayment || 0)}
                    value={depositPaid}
                    onChange={(event) => setDepositPaid(event.target.value)}
                  />
                </label>
              </div>
              <div className="credit-plan-summary">
                <div>
                  <span>Kredit məbləği</span>
                  <strong>{money(creditPlan.total)}</strong>
                </div>
                <div>
                  <span>İlkin ödəniş qalığı</span>
                  <strong>{money(initialRemaining)}</strong>
                </div>
                <div>
                  <span>Qalıq</span>
                  <strong>{money(creditPlan.balance)}</strong>
                </div>
                <div>
                  <span>{creditPlan.months > 1 ? `${creditPlan.months - 1} ay` : "Aylıq"}</span>
                  <strong>{money(creditPlan.monthly)}</strong>
                </div>
                <div>
                  <span>Son ay</span>
                  <strong>{money(creditPlan.lastPayment)}</strong>
                </div>
              </div>
              <p className="credit-plan-example">
                Bölgü: {creditPlan.months > 1 ? `${creditPlan.months - 1} ay ${money(creditPlan.monthly)}, ` : ""}
                sonuncu ay {money(creditPlan.lastPayment)}.
                {initialRemaining > 0
                  ? ` İlkin ödənişin ${money(initialRemaining)} hissəsi yığılmayınca kredit başladıla bilməz.`
                  : ""}
              </p>
              {creditValidationError ? (
                <p className="bonus-note bonus-note--error">{creditValidationError}</p>
              ) : null}



            </section>
          )}

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label seller-title">
                <Users size={16} />
                SATICILAR (MAX. 3 NƏFƏR) — TOPLAM BONUS MAX. 3%
              </span>
              <button
                type="button"
                className="secondary-btn"
                disabled={sellerRows.length >= 3}
                onClick={addSellerRow}
              >
                <Plus size={16} />
                Satıcı əlavə et
              </button>
            </div>
            <div className="order-lines">
              {sellerRows.map((row) => (
                <div className="seller-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.seller} options={sellerSearchOptions(sellers)} onChange={(value) => changeSeller(row.id, "seller", value)} placeholder="Satıcı adı ilə axtarın..." ariaLabel="Satıcı axtar və seç" />
                  <label className="bonus-input">
                    <input
                      aria-label="Bonus faizi"
                      type="number"
                      min="0"
                      max={maxBonusForRow(sellerRows, row.id)}
                      step="0.01"
                      value={row.bonus}
                      onChange={(event) => changeSeller(row.id, "bonus", event.target.value)}
                    />
                    <span>% bonus</span>
                  </label>
                  <button
                    type="button"
                    className="line-delete"
                    onClick={() => removeSellerRow(row.id)}
                    aria-label="Satıcı sətrini sil"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <p className="bonus-note">
              Nümunə: müştəri {money(paidAmount || 100)} ödəyərsə, bu sifariş üzrə cəmi{" "}
              <strong>{bonusRate}%</strong> = <strong>{money(bonusTotal || bonusRate)}</strong> bonus paylanacaq.
            </p>
            {!bonusRateValid && <p className="bonus-note bonus-note--error">Toplam bonus {MAX_TOTAL_BONUS_RATE}%-dən çox ola bilməz.</p>}
          </section>

          <section className="order-section">
            <label className="order-label" htmlFor="order-note">
              QEYD
            </label>
            <textarea
              id="order-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Çatdırılma şərtləri, xüsusi istəklər..."
            />
          </section>

          <div className="modal-actions order-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="primary-btn" disabled={!canCreateOrder}>
              Sifarişi yarat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
