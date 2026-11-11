import { formatAmount } from "../../services/format.js";
import { Fragment, useEffect, useMemo, useState } from "react";
import { PackagePlus, Search } from "lucide-react";
import { vendorInvoiceLineGross } from "./procurementMath.js";
import { toLocalIsoDate } from "../../services/date.js";

export const money = (value, currency = "AZN") => formatAmount(value, { currency });

export const qty = (value) => Number(value || 0).toLocaleString("az-AZ", { maximumFractionDigits: 3 });

export const today = () => toLocalIsoDate();

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("az-AZ");

export const toNumber = (value) => {
  const next = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(next) ? next : 0;
};

export const PO_STATUS = {
  draft: { label: "Qaralama", tone: "neutral" },
  approved: { label: "Təsdiqli", tone: "info" },
  partial: { label: "Qismən mədaxil", tone: "warning" },
  received: { label: "Mədaxil tamam", tone: "success" },
  closed: { label: "Bağlandı", tone: "dark" },
  cancelled: { label: "Ləğv edildi", tone: "danger" },
};

export const INVOICE_STATUS = {
  draft: { label: "Qaralama", tone: "neutral" },
  matched: { label: "Uyğundur", tone: "success" },
  exception: { label: "Fərq var", tone: "warning" },
  approved: { label: "Təsdiqli", tone: "info" },
  paid: { label: "Ödənilib", tone: "success" },
  cancelled: { label: "Ləğv edildi", tone: "danger" },
};

export const emptyVendor = { name: "", tax_id: "", email: "", phone: "", address: "", is_active: true };

export const emptyPo = { vendor_id: "", po_number: "", factory_name: "", order_date: today(), expected_date: "", currency: "AZN", exchange_rate: "1", payment_terms: "", notes: "" };

export const emptyReceipt = { po_id: "", grn_number: "", receipt_date: today(), notes: "" };

export const emptyInvoice = { po_id: "", invoice_number: "", invoice_date: today(), due_date: "", currency: "AZN", match_notes: "" };

export const emptyPoLine = { product_id: "", product_sku: "", description: "", qty_ordered: "1", unit: "ədəd", unit_price: "0" };

export const emptyRfq = { title: "", description: "", quantity: "1", due_at: "", vendor_ids: [] };

export const emptyPoPayment = { po_id: "", amount: "", payment_date: today(), payment_method: "bank", reference_no: "", notes: "" };

export const ENABLE_LEGACY_PAYMENTS = import.meta.env.VITE_ENABLE_LEGACY_WRITES === "true";

export function nextNumber(prefix) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

export function getError(error, fallback = "Əməliyyat tamamlanmadı") {
  if (error?.message?.includes("invoice_vat_posting_required")) {
    return "ƏDV üzrə mühasibat qeydi tamamlanmadan bu fakturanı ödəmək olmaz.";
  }
  return error?.message || fallback;
}

export function lineAmount(line) {
  const base = toNumber(line.qty_ordered) * toNumber(line.unit_price);
  return base + (base * toNumber(line.tax_rate)) / 100;
}

export function matchesQuery(values, query) {
  const needle = normalize(query);
  if (!needle) return true;
  return values.some((value) => normalize(value).includes(needle));
}

export function groupBy(rows, key) {
  return rows.reduce((map, row) => {
    const id = row[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
    return map;
  }, new Map());
}

export function StatusPill({ status, type = "po" }) {
  const meta = type === "invoice" ? INVOICE_STATUS[status] : PO_STATUS[status];
  const label = meta?.label || status || "Naməlum";
  return <span className={`procurement-page-styles-badge procurement-page-styles-badge-${meta?.tone || "neutral"}`}>{label}</span>;
}

export function IconButton({ icon: Icon, label, onClick, tone = "ghost", disabled = false, submit = false }) {
  return (
    <button
      type={submit ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
      className={`procurement-page-styles-icon-button procurement-page-styles-button-${tone}`}
 >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

export function ProductAutocomplete({ products, value, onSelect }) {
  const selected = products.find((product) => product.id === value);
  const [query, setQuery] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setQuery(selected?.name || "");
  }, [selected?.id, selected?.name]);

  const matches = useMemo(() => {
    const term = normalize(query);
    if (!term) return products.slice(0, 8);
    return products
      .filter((product) => normalize(`${product.name} ${product.sku}`).includes(term))
      .sort((a, b) => {
        const aStarts = normalize(a.name).startsWith(term) || normalize(a.sku).startsWith(term);
        const bStarts = normalize(b.name).startsWith(term) || normalize(b.sku).startsWith(term);
        return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name, "az");
      })
      .slice(0, 8);
  }, [products, query]);

  const choose = (product) => {
    setQuery(product.name);
    setOpen(false);
    setActiveIndex(0);
    onSelect(product);
  };

  return (
    <div className="product-autocomplete">
      <Search size={15} aria-hidden="true" />
      <input
        value={query}
        placeholder="Məhsul adı və ya SKU yazın"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
          if (event.key === "Enter" && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
          if (event.key === "Escape") setOpen(false);
        }}
 />
      {open && (
        <div className="product-autocomplete__menu">
          {matches.length ? matches.map((product, index) => (
            <button key={product.id} type="button" className={index === activeIndex ? "active" : ""} onMouseDown={() => choose(product)}>
              <span>{product.name}</span>
              <small>{product.sku || "SKU yoxdur"}</small>
            </button>
          )) : <div className="product-autocomplete__empty">Uyğun məhsul tapılmadı</div>}
        </div>
      )}
    </div>
  );
}

export function LineDetailTable({ lines, acceptedByLine, invoicedByLine, currency }) {
  return (
    <DataTable
      columns={["SKU", "Məhsul", "Sifariş", "Mədaxil", "Faktura", "Qiymət", "Cəm"]}
      empty="PO sətri yoxdur."
      rows={lines.map((line) => [
        line.product_sku,
        line.description || "İzah yoxdur",
        qty(line.qty_ordered),
        qty(acceptedByLine.get(line.id) || 0),
        qty(invoicedByLine.get(line.id) || 0),
        money(line.unit_price, currency),
        money(lineAmount(line), currency),
      ])}
 />
  );
}

export function ReceiptLineTable({ lines, poLines }) {
  return (
    <DataTable
      columns={["SKU", "Qəbul edildi", "Rədd edildi", "Net mədaxil"]}
      empty="Mədaxil sətri yoxdur."
      rows={lines.map((line) => {
        const poLine = poLines.find((item) => item.id === line.po_line_id);
        return [
          poLine?.product_sku || "SKU yoxdur",
          qty(line.qty_received),
          qty(line.qty_rejected),
          qty(Math.max(0, toNumber(line.qty_received) - toNumber(line.qty_rejected))),
        ];
      })}
 />
  );
}

export function InvoiceDetailTable({ lines, poLines, matchRows, currency }) {
  return (
    <div className="procurement-page-styles-stack-small">
      <DataTable
        columns={["SKU", "Faktura miqdarı", "Faktura qiyməti", "ƏDV %", "ƏDV daxil cəm"]}
        empty="Faktura sətri yoxdur."
        rows={lines.map((line) => {
          const poLine = poLines.find((item) => item.id === line.po_line_id);
          return [
            poLine?.product_sku || "SKU yoxdur",
            qty(line.qty_invoiced),
            money(line.unit_price, currency),
            qty(line.tax_rate),
            money(vendorInvoiceLineGross(line), currency),
          ];
        })}
 />
      {matchRows && (
        <DataTable
          columns={["SKU", "PO", "Mədaxil", "Faktura", "Qiymət", "Nəticə"]}
          empty="Match nəticəsi yoxdur."
          rows={matchRows.map((row) => [
            row.product_sku,
            qty(row.qty_ordered),
            qty(row.qty_accepted),
            qty(row.qty_invoiced),
            row.price_ok ? "Uyğun" : "Fərq var",
            <span key="match" className={`procurement-page-styles-badge ${row.status === "matched" ? "procurement-page-styles-badge-success" : "procurement-page-styles-badge-warning"}`}>
              {row.status === "matched" ? "Uyğundur" : row.status}
            </span>,
          ])}
 />
      )}
    </div>
  );
}

export function Panel({ title, icon: Icon, action, children }) {
  return (
    <section className="procurement-page-styles-panel">
      <div className="procurement-page-styles-panel-header">
        <h2>{title}</h2>
        <div className="procurement-page-styles-panel-tools">
          {Icon && <Icon size={18} />}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

export function Field({ label, value, onChange, type = "text", required = false, wide = false }) {
  return (
    <label className={`procurement-page-styles-field ${wide ? "procurement-page-styles-field-wide" : ""}`}>
      <span>{label}</span>
      <input className="procurement-page-styles-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

export function TwoLine({ title, subtitle }) {
  return (
    <div className="procurement-page-styles-two-line">
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}

export function Progress({ value, label }) {
  return (
    <div className="procurement-page-styles-progress-wrap">
      <div className="procurement-page-styles-progress-track">
        <span className="procurement-page-styles-progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <small>{label}</small>
    </div>
  );
}

export function Empty({ title }) {
  return (
    <div className="procurement-page-styles-empty-inline">
      <PackagePlus size={20} />
      <span>{title}</span>
    </div>
  );
}

export function DataTable({ columns, rows, empty, detail, sourceRows }) {
  const detailSource = sourceRows || rows;
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div className="procurement-page-styles-table-wrap">
      <table className="procurement-page-styles-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} className="procurement-page-styles-th">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const detailContent = detail?.(detailSource[rowIndex]);
            return (
              <Fragment key={detailSource[rowIndex]?.id || `row-${rowIndex}`}>
                <tr>
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="procurement-page-styles-td">{cell}</td>
                  ))}
                </tr>
                {detailContent && (
                  <tr>
                    <td colSpan={columns.length} className="procurement-page-styles-detail-cell">{detailContent}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
