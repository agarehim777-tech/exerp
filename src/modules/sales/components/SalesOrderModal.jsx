// Yeni satış sifarişi pəncərəsi (müştəri, məhsul sətirləri, seriallar, backorder, ödəniş/kredit və satıcı bonusları).
// Köməkçilər ../services/salesOrderForm.ts-dədir; SalesOrderModals.jsx bu komponenti köhnə idxallar üçün yenidən ixrac edir.
import { useRef, useState } from "react";
import { CircleAlert, CreditCard, Plus, Trash2, Users, X } from "lucide-react";
import { money } from "../../../services/format.js";
import { buildCreditPlan, creditTermOptions } from "../../../shared/lib/credit.js";
import { getAvailableQuantity, getBackorderPlan } from "../../../shared/lib/appDomain.jsx";
import { createClientId } from "../../../shared/utils/id.js";
import { calculateOrderFinancials } from "../services/orderCalculations.js";
import { Button, Input, Select } from "../../../shared/ui/primitives.tsx";
import { getAvailableSerialsForProduct } from "../../../shared/lib/serialStockHelpers.ts";
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

export function SalesOrderModal({ type, onClose, onCreate, orderOptions, defaults = {} }) {
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const customers = orderOptions.customers;
  const stock = orderOptions.stock;
  const catalogProducts = orderOptions.products || [];
  const sellers = orderOptions.sellers;
  const warehouses = orderOptions.warehouses || [];
  const warehouseStock = orderOptions.warehouseStock || {};
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const warehouseRows = Array.isArray(warehouseStock[warehouseId]) ? warehouseStock[warehouseId] : stock;
  const availableStock = buildSalesProductOptions(warehouseRows, catalogProducts);
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
    const nextWarehouseRows = Array.isArray(warehouseStock[nextWarehouseId])
      ? warehouseStock[nextWarehouseId]
      : stock;
    const nextStock = buildSalesProductOptions(nextWarehouseRows, catalogProducts);
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

  async function submit(event) {
    event.preventDefault();
    if (!canCreateOrder || !bonusRateValid || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
    await onCreate(type, {
      customer: selectedCustomer?.name || "",
      customerId: selectedCustomer?.id || "",
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
    } catch (error) {
      setSubmitError(error?.message || "Sifaris yadda saxlanilmadi.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card order-modal-card">
        <div className="modal-head order-modal-head">
          <div>
            <h2>Yeni Satış Sifarişi</h2>
            <p>Müştəri, məhsul və satıcı bonus faizlərini daxil edin.</p>
          </div>
          <Button variant="ghost" className="icon-btn" onClick={onClose} disabled={submitting} aria-label="Pəncərəni bağla">
            <X size={18} />
          </Button>
        </div>
        <form onSubmit={submit} className="order-modal-form" aria-busy={submitting}>
          {submitError && <p role="alert">{submitError}</p>}
          <section className="order-section">
            <label className="order-label" htmlFor="order-customer">
              MÜŞTƏRİ
            </label>
            <div className="order-two-col">
              <SearchableOrderSelect value={customerFin} options={customerSearchOptions(customers)} onChange={setCustomerFin} placeholder="Ad, telefon, FİN və ya VÖEN ilə axtarın..." ariaLabel="Müştəri axtar və seç" />
              <Select
                aria-label="Ödəniş tipi"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option>Nağd</option>
                <option>Kredit</option>
              </Select>
            </div>
            <label className="order-sub-field">
              <span>ANBAR</span>
              <Select
                aria-label="Rezerv anbarı"
                value={warehouseId}
                onChange={(event) => changeWarehouse(event.target.value)}
              >
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
              <div>
                <span className="order-label">DAXİLİ QEYDLƏR</span>
                <small className="u-display-block u-margin-top-4px u-color-muted">Qeydin kim üçün olduğunu seçin. Bu məlumat sifariş kartında saxlanacaq.</small>
              </div>
              <Button variant="secondary" type="button"  onClick={() => setInternalNotes((rows) => [...rows, { id: createClientId(), recipient: "Maliyyə", text: "" }])}>
                <Plus size={16} /> Qeyd əlavə et
              </Button>
            </div>
            <div className="order-lines">
              {internalNotes.map((item) => (
                <div className="order-internal-note-line" key={item.id}>
                  <Select value={item.recipient} onChange={(event) => setInternalNotes((rows) => rows.map((row) => row.id === item.id ? { ...row, recipient: event.target.value } : row))}>
                    <option>Maliyyə</option>
                    <option>Təhvil əməkdaşı</option>
                    <option>Anbar</option>
                    <option>Satış</option>
                    <option>Rəhbərlik</option>
                    <option>Ümumi</option>
                  </Select>
                  <Input value={item.text} onChange={(event) => setInternalNotes((rows) => rows.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row))} placeholder={`${item.recipient} üçün qeyd yazın…`} />
                  <Button variant="ghost" type="button" className="line-delete" onClick={() => setInternalNotes((rows) => rows.length === 1 ? rows.map((row) => ({ ...row, text: "" })) : rows.filter((row) => row.id !== item.id))} aria-label="Qeydi sil"><Trash2 size={17} /></Button>
                </div>
              ))}
            </div>
          </section>

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label">MƏHSULLAR</span>
              <Button variant="secondary" type="button"  onClick={addProductRow}>
                <Plus size={16} />
                Sətr əlavə et
              </Button>
            </div>
            <div className="order-lines">
              {productRows.map((row) => (
                <div className="order-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.product} options={productSearchOptions(availableStock)} onChange={(value) => changeProduct(row.id, "product", value)} placeholder="Məhsul adı və ya SKU..." ariaLabel="Məhsul axtar və seç" />
                  <Input
                    aria-label="Miqdar"
                    type="number"
                    min="1"
                    value={row.qty}
                    onChange={(event) => changeProduct(row.id, "qty", event.target.value)}
                  />
                  <Input
                    aria-label="Qiymət"
                    type="number"
                    min="0"
                    value={row.price}
                    onChange={(event) => changeProduct(row.id, "price", event.target.value)}
                  />
                  <Select
                    aria-label="ƏDV seçimi"
                    value={row.vatRate || 0}
                    onChange={(event) => changeProduct(row.id, "vatRate", Number(event.target.value))}
                  >
                    <option value="0">ƏDV yoxdur</option>
                    <option value="18">ƏDV 18%</option>
                  </Select>
                  <Button variant="ghost"
                    type="button"
                    className="line-delete"
                    onClick={() => removeProductRow(row.id)}
                    aria-label="Məhsul sətrini sil"
                  >
                    <Trash2 size={17} />
                  </Button>
                  {getRowSerialOptions(row).length > 0 && (
                    <div className="serial-pick-list">
                      {Array.from({ length: Math.max(1, Number(row.qty || 1)) }).map((_, index) => (
                        <label key={`${row.id}-serial-${index}`}>
                          <span>IMEI #{index + 1}</span>
                          <Select
                            value={row.serials?.[index] || ""}
                            onChange={(event) => changeRowSerial(row.id, index, event.target.value)}
                          >
                            <option value="">Serial seç</option>
                            {getRowSerialOptions(row).map((serial) => (
                              <option key={serial} value={serial}>
                                {serial}
                              </option>
                            ))}
                          </Select>
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
                  <Select
                    aria-label="Kredit müddəti"
                    value={creditMonths}
                    onChange={(event) => setCreditMonths(Number(event.target.value))}
                  >
                    {creditTermOptions.map((month) => (
                      <option key={month} value={month}>
                        {month} ay
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="order-sub-field">
                  <span>İLKİN ÖDƏNİŞ (HƏDƏF)</span>
                  <Input
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
                  <Input
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
              <Button variant="secondary"
                type="button"
                
                disabled={sellerRows.length >= 3}
                onClick={addSellerRow}
              >
                <Plus size={16} />
                Satıcı əlavə et
              </Button>
            </div>
            <div className="order-lines">
              {sellerRows.map((row) => (
                <div className="seller-line-grid" key={row.id}>
                  <SearchableOrderSelect value={row.seller} options={sellerSearchOptions(sellers)} onChange={(value) => changeSeller(row.id, "seller", value)} placeholder="Satıcı adı ilə axtarın..." ariaLabel="Satıcı axtar və seç" />
                  <label className="bonus-input">
                    <Input
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
                  <Button variant="ghost"
                    type="button"
                    className="line-delete"
                    onClick={() => removeSellerRow(row.id)}
                    aria-label="Satıcı sətrini sil"
                  >
                    <Trash2 size={17} />
                  </Button>
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
            <Button variant="secondary" type="button"  onClick={onClose} disabled={submitting}>
              Ləğv et
            </Button>
            <Button variant="primary" type="submit"  disabled={!canCreateOrder || submitting}>
              Sifarişi yarat
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
