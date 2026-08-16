import { useState } from "react";
import { CreditCard, Plus, Trash2, Users, X } from "lucide-react";
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

function getAvailableSerialsForProduct(warehouseStock = {}, warehouseId, product) {
  const item = (warehouseStock?.[warehouseId] || []).find((row) => row.product === product);
  if (!item || !isSerialTrackedProduct(item)) return [];
  return (item.serials || []).filter((serial) => serial.status === "Anbarda").map((serial) => serial.imei);
}
export function SalesOperationModal({ order, orderOptions, onClose, onSubmit }) {
  const customers = orderOptions.customers || [];
  const stock = orderOptions.stock || [];
  const warehouses = orderOptions.warehouses || [];
  const warehouseStock = orderOptions.warehouseStock || {};
  const sellers = orderOptions.sellers || [];
  const delivered = order.status === "Təhvil verilib";
  const firstWarehouseId = order.warehouseId || warehouses[0]?.id || "";
  const firstSeller = sellers[0] || { name: "" };

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
  const [customerFin, setCustomerFin] = useState(order.fin || customers[0]?.fin || "");
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
    return (rows.length > 0 ? rows : [{ seller: firstSeller.name, bonus: 0 }]).map((row) => ({
      id: createClientId(),
      ...row,
    }));
  });

  const selectedCustomer = customers.find((customer) => customer.fin === customerFin);
  const lineTotal = calculateOrderLineTotal(productRows);
  const paymentPreview = paymentMethod === "Kredit" ? Number(initialPayment || 0) : Number(paid || 0);
  const bonusRate = sellerRows.reduce((sum, row) => sum + Number(row.bonus || 0), 0);
  const canSubmit = Boolean(customerName && warehouseId && productRows.some((row) => row.product) && Number(amount || 0) > 0);

  function changeCustomer(fin) {
    const customer = customers.find((item) => item.fin === fin);
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
    setSellerRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  }

  function addSellerRow() {
    if (sellerRows.length >= 3) return;
    const used = new Set(sellerRows.map((row) => row.seller));
    const nextSeller = sellers.find((seller) => !used.has(seller.name)) || firstSeller;
    setSellerRows((rows) => [...rows, { id: createClientId(), seller: nextSeller.name, bonus: 0 }]);
  }

  function removeSellerRow(rowId) {
    setSellerRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function submit(event) {
    event.preventDefault();
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
              <select value={customerFin} onChange={(event) => changeCustomer(event.target.value)}>
                {customers.map((customer) => (
                  <option key={customer.fin} value={customer.fin}>
                    {customer.name} — {customer.fin}
                  </option>
                ))}
                {!customers.some((customer) => customer.fin === customerFin) && <option value={customerFin}>{customerName}</option>}
              </select>
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
                  <select value={row.product} onChange={(event) => changeProduct(row.id, "product", event.target.value)} disabled={delivered}>
                    {availableStock.map((item) => (
                      <option key={item.product} value={item.product}>
                        {item.product} — {getAvailableQuantity(item)} satış üçün
                      </option>
                    ))}
                  </select>
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
                  <select value={row.seller} onChange={(event) => changeSeller(row.id, "seller", event.target.value)}>
                    {sellers.map((seller) => (
                      <option key={seller.name} value={seller.name}>{seller.name}</option>
                    ))}
                    {row.seller && !sellers.some((seller) => seller.name === row.seller) && <option value={row.seller}>{row.seller}</option>}
                  </select>
                  <label className="bonus-input">
                    <input type="number" min="0" max="100" value={row.bonus} onChange={(event) => changeSeller(row.id, "bonus", event.target.value)} />
                    <span>% bonus</span>
                  </label>
                  <button type="button" className="line-delete" onClick={() => removeSellerRow(row.id)} aria-label="Satıcı sətrini sil">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
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
  const firstProduct = availableStock[0] || stock[0] || { product: "", price: 0 };
  const firstSeller = sellers[0] || { name: "" };
  const [customerFin, setCustomerFin] = useState(customers[0]?.fin || "");
  const [paymentMethod, setPaymentMethod] = useState(defaults.paymentMethod || "Nağd");
  const [creditMonths, setCreditMonths] = useState(12);
  const [initialPayment, setInitialPayment] = useState(0);
  const [productRows, setProductRows] = useState([
    {
      id: createClientId(),
      product: firstProduct.product,
      qty: 1,
      price: firstProduct.price,
      vatRate: 0,
      serials: getAvailableSerialsForProduct(warehouseStock, warehouseId, firstProduct.product).slice(0, 1),
    },
  ]);
  const [sellerRows, setSellerRows] = useState([
    { id: createClientId(), seller: firstSeller.name, bonus: 3 },
  ]);
  const [note, setNote] = useState("");
  const [internalNotes, setInternalNotes] = useState([
    { id: createClientId(), recipient: "Maliyyə", text: "" },
  ]);

  const selectedCustomer = customers.find((customer) => customer.fin === customerFin) || customers[0];
  const { subtotal: orderSubtotal, vat: orderVat, total: orderTotal } = calculateOrderFinancials(productRows);
  const creditPlan = buildCreditPlan({
    total: orderTotal,
    initialPayment,
    months: creditMonths,
  });
  const paidAmount = paymentMethod === "Kredit" ? creditPlan.initialPayment : orderTotal;
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
  

  const canCreateOrder = Boolean(
    selectedCustomer &&
      warehouseId &&
      availableStock.length > 0 &&
      orderTotal > 0 &&
      productRows.some((row) => row.product),
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
    const nextFirstProduct = nextStock[0] || { product: "", price: 0 };
    setWarehouseId(nextWarehouseId);
    setProductRows((rows) =>
      rows.map((row) => {
        const match = nextStock.find((item) => item.product === row.product) || nextFirstProduct;
        return {
          ...row,
          product: match.product,
          price: match.price,
          serials: getAvailableSerialsForProduct(warehouseStock, nextWarehouseId, match.product).slice(0, Math.max(1, Number(row.qty || 1))),
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
        product: firstProduct.product,
        qty: 1,
        price: firstProduct.price,
        vatRate: 0,
        serials: getAvailableSerialsForProduct(warehouseStock, warehouseId, firstProduct.product).slice(0, 1),
      },
    ]);
  }

  function removeProductRow(rowId) {
    setProductRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function changeSeller(rowId, field, value) {
    setSellerRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
  }

  function addSellerRow() {
    if (sellerRows.length >= 3) return;
    const used = new Set(sellerRows.map((row) => row.seller));
    const nextSeller = sellers.find((seller) => !used.has(seller.name)) || firstSeller;
    setSellerRows((rows) => [
      ...rows,
      { id: createClientId(), seller: nextSeller.name, bonus: 1 },
    ]);
  }

  function removeSellerRow(rowId) {
    setSellerRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function submit(event) {
    event.preventDefault();
    if (!canCreateOrder) return;
    onCreate(type, {
      customer: selectedCustomer?.name || "",
      fin: selectedCustomer?.fin || "",
      paymentMethod,
      warehouseId,
      creditMonths,
      initialPayment,
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
              <select
                id="order-customer"
                value={customerFin}
                onChange={(event) => setCustomerFin(event.target.value)}
              >
                {customers.map((customer) => (
                  <option key={customer.fin} value={customer.fin}>
                    {customer.name} — {customer.fin}
                  </option>
                ))}
              </select>
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
                  <select
                    aria-label="Məhsul seç"
                    value={row.product}
                    onChange={(event) => changeProduct(row.id, "product", event.target.value)}
                  >
                    {availableStock.map((item) => (
                      <option key={item.product} value={item.product}>
                        {item.product} — {item.total - item.reserved} satış üçün
                      </option>
                    ))}
                  </select>
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
                  <span>İLKİN ÖDƏNİŞ</span>
                  <input
                    aria-label="İlkin ödəniş"
                    type="number"
                    min="0"
                    max={orderTotal}
                    value={initialPayment}
                    onChange={(event) => setInitialPayment(event.target.value)}
                  />
                </label>
              </div>
              <div className="credit-plan-summary">
                <div>
                  <span>Kredit məbləği</span>
                  <strong>{money(creditPlan.total)}</strong>
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
              </p>
            </section>
          )}

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label seller-title">
                <Users size={16} />
                SATICILAR (MAX. 3) — HƏR BİRİ ÖZ BONUS %
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
                  <select
                    aria-label="Satıcı seç"
                    value={row.seller}
                    onChange={(event) => changeSeller(row.id, "seller", event.target.value)}
                  >
                    {sellers.length === 0 && <option value="">Satıcı seçilməyib</option>}
                    {sellers.map((seller) => (
                      <option key={seller.name} value={seller.name}>
                        {seller.name}
                      </option>
                    ))}
                  </select>
                  <label className="bonus-input">
                    <input
                      aria-label="Bonus faizi"
                      type="number"
                      min="0"
                      max="100"
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
