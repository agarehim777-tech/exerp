// Mövcud satış sifarişi üzərində əməliyyat pəncərəsi (məhsul, ödəniş, kredit, satıcı bonusu və status dəyişikliyi).
// Köməkçilər ../services/salesOrderForm.ts-dədir; SalesOrderModals.jsx bu komponenti köhnə idxallar üçün yenidən ixrac edir.
import { useState } from "react";
import { CreditCard, Plus, Trash2, Users, X } from "lucide-react";
import { stages } from "../../../data.js";
import { money } from "../../../services/format.js";
import { creditTermOptions } from "../../../shared/lib/credit.js";
import { currentBusinessDate, getOrderSellerBonuses, normalizeOrderProductLines } from "../../../shared/lib/appDomain.jsx";
import { createClientId } from "../../../shared/utils/id.js";
import { calculateOrderLineTotal } from "../services/orderCalculations.js";
import { Button, Input, Select } from "../../../shared/ui/primitives.tsx";
import {
  MAX_TOTAL_BONUS_RATE,
  maxBonusForRow,
  updateSellerRowWithLimit,
  getCustomerIdentity,
  customerSearchOptions,
  productSearchOptions,
  buildSalesProductOptions,
  sellerSearchOptions,
} from "../services/salesOrderForm.ts";
import { SearchableOrderSelect } from "./SearchableOrderSelect.tsx";

export function SalesOperationModal({ order, orderOptions, onClose, onSubmit }) {
  const customers = orderOptions.customers || [];
  const stock = orderOptions.stock || [];
  const warehouses = orderOptions.warehouses || [];
  const warehouseStock = orderOptions.warehouseStock || {};
  const sellers = orderOptions.sellers || [];
  const catalogProducts = orderOptions.products || [];
  const delivered = order.status === "Təhvil verilib";
  const firstWarehouseId = order.warehouseId || warehouses[0]?.id || "";

  const getStockOptions = (targetWarehouseId) => {
    const rows = Array.isArray(warehouseStock[targetWarehouseId]) ? warehouseStock[targetWarehouseId] : stock;
    const byProduct = new Map(buildSalesProductOptions(rows, catalogProducts).map((item) => [item.product, item]));
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
      // Only an id for the customer picked from the list; a typed name is resolved (uniquely) later.
      customerId: selectedCustomer && selectedCustomer.name === customerName ? selectedCustomer.id || "" : "",
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
          <Button variant="ghost" className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </Button>
        </div>
        <form onSubmit={submit} className="order-modal-form">
          <section className="order-section">
            <label className="order-label">MÜŞTƏRİ VƏ ÖDƏNİŞ</label>
            <div className="order-two-col">
              <SearchableOrderSelect value={customerFin} options={customerSearchOptions(customers)} onChange={changeCustomer} placeholder="Müştəri axtarın..." ariaLabel="Müştəri axtar və seç" />
              <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option>Nağd</option>
                <option>Kart</option>
                <option>Köçürmə</option>
                <option>Kredit</option>
              </Select>
            </div>
            <div className="order-two-col">
              <label className="order-sub-field">
                <span>Müştəri adı</span>
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </label>
              <label className="order-sub-field">
                <span>Tarix</span>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
            </div>
            <label className="order-sub-field">
              <span>ANBAR</span>
              <Select value={warehouseId} onChange={(event) => changeWarehouse(event.target.value)} disabled={delivered}>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} — {warehouse.city}
                  </option>
                ))}
              </Select>
            </label>
          </section>

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label">MƏHSULLAR</span>
              <Button variant="secondary" type="button"  onClick={addProductRow} disabled={delivered}>
                <Plus size={16} />
                Sətr əlavə et
              </Button>
            </div>
            <div className="order-lines">
              {productRows.map((row) => (
                <div className="order-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.product} options={productSearchOptions(availableStock)} onChange={(value) => changeProduct(row.id, "product", value)} placeholder="Məhsul və ya SKU axtarın..." ariaLabel="Məhsul axtar və seç" disabled={delivered} />
                  <Input type="number" min="1" value={row.qty} onChange={(event) => changeProduct(row.id, "qty", event.target.value)} disabled={delivered} />
                  <Input type="number" min="0" value={row.price} onChange={(event) => changeProduct(row.id, "price", event.target.value)} disabled={delivered} />
                  <Button variant="ghost" type="button" className="line-delete" onClick={() => removeProductRow(row.id)} disabled={delivered} aria-label="Məhsul sətrini sil">
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="order-total edit-order-total">
              <span>Sətir cəmi: {money(lineTotal)}</span>
              <label>
                <span>Yekun məbləğ</span>
                <Input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
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
                  <Select value={creditMonths} onChange={(event) => setCreditMonths(Number(event.target.value))}>
                    {creditTermOptions.map((month) => (
                      <option key={month} value={month}>{month} ay</option>
                    ))}
                  </Select>
                </label>
                <label className="order-sub-field">
                  <span>İlkin ödəniş</span>
                  <Input type="number" min="0" max={amount} value={initialPayment} onChange={(event) => setInitialPayment(event.target.value)} />
                </label>
              </div>
            </section>
          ) : (
            <section className="order-section">
              <label className="order-sub-field">
                <span>Daxil olan</span>
                <Input type="number" min="0" max={amount} value={paid} onChange={(event) => setPaid(event.target.value)} />
              </label>
            </section>
          )}

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label seller-title">
                <Users size={16} />
                SATICI BONUSLARI
              </span>
              <Button variant="secondary" type="button"  disabled={sellerRows.length >= 3} onClick={addSellerRow}>
                <Plus size={16} />
                Satıcı əlavə et
              </Button>
            </div>
            <div className="order-lines">
              {sellerRows.map((row) => (
                <div className="seller-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.seller} options={sellerSearchOptions(sellers, row.seller)} onChange={(value) => changeSeller(row.id, "seller", value)} placeholder="Satıcı adı ilə axtarın..." ariaLabel="Satıcı axtar və seç" />
                  <label className="bonus-input">
                    <Input type="number" min="0" max={maxBonusForRow(sellerRows, row.id)} step="0.01" value={row.bonus} onChange={(event) => changeSeller(row.id, "bonus", event.target.value)} />
                    <span>% bonus</span>
                  </label>
                  <Button variant="ghost" type="button" className="line-delete" onClick={() => removeSellerRow(row.id)} aria-label="Satıcı sətrini sil">
                    <Trash2 size={16} />
                  </Button>
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
                <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {stages
                    .filter((stage) => delivered || stage !== "Təhvil verilib")
                    .map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                </Select>
              </label>
              <label className="order-sub-field">
                <span>Ünvan</span>
                <Input value={address} onChange={(event) => setAddress(event.target.value)} />
              </label>
            </div>
            <label className="order-sub-field">
              <span>Qeyd</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </section>

          <div className="modal-actions order-actions">
            <Button variant="secondary" type="button"  onClick={onClose}>Ləğv et</Button>
            <Button variant="primary" type="submit"  disabled={!canSubmit}>Yadda saxla</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
