import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider.jsx";

const fmt = (n) => Number(n || 0).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColor = {
  draft: "#64748b", approved: "#0d7a5f", partial: "#c9a84c", received: "#065f46",
  closed: "#334155", cancelled: "#b91c1c",
  matched: "#065f46", exception: "#b45309", paid: "#0f766e",
};

function Badge({ status }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, color: "#fff",
      background: statusColor[status] || "#64748b",
    }}>{status}</span>
  );
}

export default function ProcurementPage() {
  const { profile } = useAuth();
  const tenantId = profile?.active_tenant_id;
  const [tab, setTab] = useState("po");

  if (!tenantId) return <div style={{ padding: 32 }}>Aktiv şirkət seçilməyib.</div>;

  return (
    <div style={{ padding: 24, fontFamily: "Manrope, system-ui, sans-serif", maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <Link to="/" style={{ color: "#0d7a5f", fontSize: 13 }}>← Panelə qayıt</Link>
        <h1 style={{ fontFamily: "Sora, sans-serif", fontSize: 28, margin: "8px 0 4px", color: "#064e3b" }}>
          Satınalma & 3-way match
        </h1>
        <p style={{ color: "#64748b", margin: 0 }}>
          Sifariş → Mədaxil → Faktura zəncirini idarə et və 3-way uyğunlaşma nəticələrini yoxla.
        </p>
      </header>

      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        {[
          ["vendors", "Vendorlar"],
          ["po", "Sifarişlər (PO)"],
          ["grn", "Mədaxil (GRN)"],
          ["invoices", "Fakturalar"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: "10px 16px", border: 0, background: "transparent",
              borderBottom: tab === id ? "2px solid #c9a84c" : "2px solid transparent",
              color: tab === id ? "#064e3b" : "#64748b",
              fontWeight: 600, cursor: "pointer",
            }}
          >{label}</button>
        ))}
      </nav>

      {tab === "vendors" && <VendorsTab tenantId={tenantId} />}
      {tab === "po" && <POTab tenantId={tenantId} />}
      {tab === "grn" && <GRNTab tenantId={tenantId} />}
      {tab === "invoices" && <InvoicesTab tenantId={tenantId} />}
    </div>
  );
}

// ---------------------- VENDORS ----------------------
function VendorsTab({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", tax_id: "", email: "", phone: "" });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("vendors").select("*").order("created_at", { ascending: false });
    if (error) setErr(error.message); else setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setErr("");
    if (!form.name.trim()) return setErr("Ad tələb olunur");
    const { error } = await supabase.from("vendors").insert({ ...form, tenant_id: tenantId });
    if (error) return setErr(error.message);
    setForm({ name: "", tax_id: "", email: "", phone: "" });
    load();
  }

  return (
    <section>
      <form onSubmit={add} style={panel}>
        <h3 style={h3}>Yeni vendor</h3>
        <div style={grid4}>
          <input placeholder="Ad" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inp} />
          <input placeholder="VÖEN" value={form.tax_id} onChange={e => setForm({ ...form, tax_id: e.target.value })} style={inp} />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inp} />
          <input placeholder="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inp} />
        </div>
        <button type="submit" style={btnPrimary}>Əlavə et</button>
        {err && <p style={errStyle}>{err}</p>}
      </form>

      <Table
        headers={["Ad", "VÖEN", "Email", "Telefon", "Aktivlik"]}
        rows={rows.map(r => [r.name, r.tax_id || "—", r.email || "—", r.phone || "—", r.is_active ? "✓" : "—"])}
        empty="Vendor yoxdur"
      />
    </section>
  );
}

// ---------------------- PURCHASE ORDERS ----------------------
function POTab({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({ vendor_id: "", po_number: "", expected_date: "" });
  const [lines, setLines] = useState([{ product_sku: "", qty_ordered: "", unit_price: "" }]);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [poLines, setPoLines] = useState({});

  const load = useCallback(async () => {
    const [{ data: pos }, { data: vs }] = await Promise.all([
      supabase.from("purchase_orders").select("*, vendors(name)").order("created_at", { ascending: false }),
      supabase.from("vendors").select("id,name").eq("is_active", true).order("name"),
    ]);
    setRows(pos || []); setVendors(vs || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function loadLines(poId) {
    if (poLines[poId]) return;
    const { data } = await supabase.from("purchase_order_lines").select("*").eq("po_id", poId).order("line_no");
    setPoLines((s) => ({ ...s, [poId]: data || [] }));
  }

  async function add(e) {
    e.preventDefault();
    setErr("");
    if (!form.vendor_id || !form.po_number) return setErr("Vendor və PO nömrəsi tələb olunur");
    const validLines = lines.filter(l => l.product_sku && Number(l.qty_ordered) > 0 && Number(l.unit_price) >= 0);
    if (!validLines.length) return setErr("Ən azı bir sətir tələb olunur");

    const { data: po, error } = await supabase.from("purchase_orders").insert({
      tenant_id: tenantId, vendor_id: form.vendor_id, po_number: form.po_number,
      expected_date: form.expected_date || null, status: "approved",
    }).select().single();
    if (error) return setErr(error.message);

    const linesPayload = validLines.map((l, i) => ({
      po_id: po.id, line_no: i + 1, product_sku: l.product_sku,
      qty_ordered: Number(l.qty_ordered), unit_price: Number(l.unit_price),
    }));
    const { error: e2 } = await supabase.from("purchase_order_lines").insert(linesPayload);
    if (e2) return setErr(e2.message);

    setForm({ vendor_id: "", po_number: "", expected_date: "" });
    setLines([{ product_sku: "", qty_ordered: "", unit_price: "" }]);
    load();
  }

  return (
    <section>
      <form onSubmit={add} style={panel}>
        <h3 style={h3}>Yeni sifariş (PO)</h3>
        <div style={grid4}>
          <select value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })} style={inp}>
            <option value="">Vendor seç</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input placeholder="PO nömrəsi" value={form.po_number} onChange={e => setForm({ ...form, po_number: e.target.value })} style={inp} />
          <input type="date" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} style={inp} />
          <div />
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>Sətirlər</div>
          {lines.map((ln, i) => (
            <div key={i} style={{ ...grid4, marginBottom: 6 }}>
              <input placeholder="SKU / məhsul" value={ln.product_sku} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, product_sku: e.target.value } : x))} style={inp} />
              <input placeholder="Miqdar" type="number" step="0.001" value={ln.qty_ordered} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, qty_ordered: e.target.value } : x))} style={inp} />
              <input placeholder="Vahid qiymət" type="number" step="0.0001" value={ln.unit_price} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))} style={inp} />
              <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} style={btnGhost}>Sil</button>
            </div>
          ))}
          <button type="button" onClick={() => setLines([...lines, { product_sku: "", qty_ordered: "", unit_price: "" }])} style={btnGhost}>+ Sətir əlavə et</button>
        </div>
        <button type="submit" style={{ ...btnPrimary, marginTop: 12 }}>PO yarat</button>
        {err && <p style={errStyle}>{err}</p>}
      </form>

      <div style={{ ...panel, marginTop: 20 }}>
        <h3 style={h3}>Sifarişlər</h3>
        {!rows.length && <p style={{ color: "#64748b" }}>Sifariş yoxdur</p>}
        {rows.map(po => (
          <div key={po.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                 onClick={() => { setExpanded(expanded === po.id ? null : po.id); loadLines(po.id); }}>
              <div>
                <div style={{ fontWeight: 600, color: "#064e3b" }}>{po.po_number} <Badge status={po.status} /></div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{po.vendors?.name} · {po.order_date}</div>
              </div>
              <div style={{ color: "#94a3b8" }}>{expanded === po.id ? "▾" : "▸"}</div>
            </div>
            {expanded === po.id && (
              <div style={{ padding: "10px 0 0 16px" }}>
                <Table
                  headers={["№", "SKU", "Miqdar", "Vahid qiymət", "Cəm"]}
                  rows={(poLines[po.id] || []).map(l => [
                    l.line_no, l.product_sku, fmt(l.qty_ordered), fmt(l.unit_price),
                    fmt(l.qty_ordered * l.unit_price),
                  ])}
                  empty="Sətir yoxdur"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------- GOODS RECEIPTS ----------------------
function GRNTab({ tenantId }) {
  const [pos, setPos] = useState([]);
  const [grns, setGrns] = useState([]);
  const [form, setForm] = useState({ po_id: "", grn_number: "" });
  const [poLines, setPoLines] = useState([]);
  const [recv, setRecv] = useState({}); // po_line_id -> {qty_received, qty_rejected}
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [{ data: p }, { data: g }] = await Promise.all([
      supabase.from("purchase_orders").select("id, po_number, vendors(name)").in("status", ["approved", "partial"]),
      supabase.from("goods_receipts").select("*, purchase_orders(po_number)").order("created_at", { ascending: false }),
    ]);
    setPos(p || []); setGrns(g || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.po_id) { setPoLines([]); return; }
    supabase.from("purchase_order_lines").select("*").eq("po_id", form.po_id).order("line_no")
      .then(({ data }) => setPoLines(data || []));
  }, [form.po_id]);

  async function add(e) {
    e.preventDefault();
    setErr("");
    if (!form.po_id || !form.grn_number) return setErr("PO və GRN nömrəsi tələb olunur");
    const items = Object.entries(recv)
      .filter(([, v]) => Number(v?.qty_received) > 0)
      .map(([po_line_id, v]) => ({
        po_line_id, qty_received: Number(v.qty_received), qty_rejected: Number(v.qty_rejected || 0),
      }));
    if (!items.length) return setErr("Ən azı bir sətir qəbul edin");

    const { data: grn, error } = await supabase.from("goods_receipts").insert({
      tenant_id: tenantId, po_id: form.po_id, grn_number: form.grn_number,
    }).select().single();
    if (error) return setErr(error.message);

    const { error: e2 } = await supabase.from("goods_receipt_lines").insert(items.map(i => ({ ...i, grn_id: grn.id })));
    if (e2) return setErr(e2.message);

    setForm({ po_id: "", grn_number: "" });
    setRecv({});
    load();
  }

  return (
    <section>
      <form onSubmit={add} style={panel}>
        <h3 style={h3}>Yeni mədaxil (GRN)</h3>
        <div style={grid4}>
          <select value={form.po_id} onChange={e => { setForm({ ...form, po_id: e.target.value }); setRecv({}); }} style={inp}>
            <option value="">PO seç</option>
            {pos.map(p => <option key={p.id} value={p.id}>{p.po_number} — {p.vendors?.name}</option>)}
          </select>
          <input placeholder="GRN nömrəsi" value={form.grn_number} onChange={e => setForm({ ...form, grn_number: e.target.value })} style={inp} />
          <div /><div />
        </div>
        {poLines.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>Qəbul olunacaq sətirlər</div>
            {poLines.map(l => (
              <div key={l.id} style={{ ...grid4, marginBottom: 6, alignItems: "center" }}>
                <div style={{ fontSize: 13 }}>{l.product_sku} <span style={{ color: "#94a3b8" }}>(sifariş: {fmt(l.qty_ordered)})</span></div>
                <input type="number" step="0.001" placeholder="Qəbul edildi"
                  value={recv[l.id]?.qty_received || ""}
                  onChange={e => setRecv({ ...recv, [l.id]: { ...(recv[l.id] || {}), qty_received: e.target.value } })}
                  style={inp} />
                <input type="number" step="0.001" placeholder="Rədd edildi"
                  value={recv[l.id]?.qty_rejected || ""}
                  onChange={e => setRecv({ ...recv, [l.id]: { ...(recv[l.id] || {}), qty_rejected: e.target.value } })}
                  style={inp} />
                <div />
              </div>
            ))}
          </div>
        )}
        <button type="submit" style={{ ...btnPrimary, marginTop: 12 }}>Mədaxili qeyd et</button>
        {err && <p style={errStyle}>{err}</p>}
      </form>

      <div style={{ ...panel, marginTop: 20 }}>
        <h3 style={h3}>Mədaxil siyahısı</h3>
        <Table
          headers={["GRN №", "PO", "Tarix"]}
          rows={grns.map(g => [g.grn_number, g.purchase_orders?.po_number || "—", g.receipt_date])}
          empty="Mədaxil qeydi yoxdur"
        />
      </div>
    </section>
  );
}

// ---------------------- VENDOR INVOICES + 3-way match ----------------------
function InvoicesTab({ tenantId }) {
  const [rows, setRows] = useState([]);
  const [pos, setPos] = useState([]);
  const [form, setForm] = useState({ po_id: "", invoice_number: "" });
  const [poLines, setPoLines] = useState([]);
  const [invLines, setInvLines] = useState({}); // po_line_id -> {qty_invoiced, unit_price}
  const [err, setErr] = useState("");
  const [match, setMatch] = useState({}); // invoice_id -> rows

  const load = useCallback(async () => {
    const [{ data: v }, { data: p }] = await Promise.all([
      supabase.from("vendor_invoices").select("*, vendors(name), purchase_orders(po_number)").order("created_at", { ascending: false }),
      supabase.from("purchase_orders").select("id, po_number, vendor_id, vendors(name)").in("status", ["approved", "partial", "received"]),
    ]);
    setRows(v || []); setPos(p || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.po_id) { setPoLines([]); return; }
    supabase.from("purchase_order_lines").select("*").eq("po_id", form.po_id).order("line_no")
      .then(({ data }) => setPoLines(data || []));
  }, [form.po_id]);

  async function add(e) {
    e.preventDefault();
    setErr("");
    if (!form.po_id || !form.invoice_number) return setErr("PO və faktura nömrəsi tələb olunur");
    const po = pos.find(p => p.id === form.po_id);
    if (!po) return setErr("PO tapılmadı");
    const items = Object.entries(invLines)
      .filter(([, v]) => Number(v?.qty_invoiced) > 0 && v?.unit_price !== "")
      .map(([po_line_id, v]) => ({
        po_line_id, qty_invoiced: Number(v.qty_invoiced), unit_price: Number(v.unit_price),
      }));
    if (!items.length) return setErr("Ən azı bir sətir tələb olunur");

    const { data: inv, error } = await supabase.from("vendor_invoices").insert({
      tenant_id: tenantId, vendor_id: po.vendor_id, po_id: po.id, invoice_number: form.invoice_number,
    }).select().single();
    if (error) return setErr(error.message);

    const { error: e2 } = await supabase.from("vendor_invoice_lines").insert(items.map(i => ({ ...i, invoice_id: inv.id })));
    if (e2) return setErr(e2.message);

    await supabase.rpc("apply_invoice_match", { _invoice_id: inv.id });
    setForm({ po_id: "", invoice_number: "" });
    setInvLines({});
    load();
  }

  async function runMatch(invoiceId) {
    const [{ data: rows }, { data: status }] = await Promise.all([
      supabase.rpc("evaluate_invoice_match", { _invoice_id: invoiceId }),
      supabase.rpc("apply_invoice_match", { _invoice_id: invoiceId }),
    ]);
    setMatch(m => ({ ...m, [invoiceId]: rows || [] }));
    if (status) load();
  }

  return (
    <section>
      <form onSubmit={add} style={panel}>
        <h3 style={h3}>Yeni vendor fakturası</h3>
        <div style={grid4}>
          <select value={form.po_id} onChange={e => { setForm({ ...form, po_id: e.target.value }); setInvLines({}); }} style={inp}>
            <option value="">PO seç</option>
            {pos.map(p => <option key={p.id} value={p.id}>{p.po_number} — {p.vendors?.name}</option>)}
          </select>
          <input placeholder="Faktura nömrəsi" value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} style={inp} />
          <div /><div />
        </div>
        {poLines.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#334155" }}>Fakturaya sətirlər</div>
            {poLines.map(l => (
              <div key={l.id} style={{ ...grid4, marginBottom: 6, alignItems: "center" }}>
                <div style={{ fontSize: 13 }}>
                  {l.product_sku} <span style={{ color: "#94a3b8" }}>(PO: {fmt(l.qty_ordered)} × {fmt(l.unit_price)})</span>
                </div>
                <input type="number" step="0.001" placeholder="Fakturada miqdar"
                  value={invLines[l.id]?.qty_invoiced || ""}
                  onChange={e => setInvLines({ ...invLines, [l.id]: { ...(invLines[l.id] || {}), qty_invoiced: e.target.value } })}
                  style={inp} />
                <input type="number" step="0.0001" placeholder="Fakturada qiymət"
                  value={invLines[l.id]?.unit_price ?? ""}
                  onChange={e => setInvLines({ ...invLines, [l.id]: { ...(invLines[l.id] || {}), unit_price: e.target.value } })}
                  style={inp} />
                <div />
              </div>
            ))}
          </div>
        )}
        <button type="submit" style={{ ...btnPrimary, marginTop: 12 }}>Faktura yarat + match et</button>
        {err && <p style={errStyle}>{err}</p>}
      </form>

      <div style={{ ...panel, marginTop: 20 }}>
        <h3 style={h3}>Fakturalar</h3>
        {!rows.length && <p style={{ color: "#64748b" }}>Faktura yoxdur</p>}
        {rows.map(inv => (
          <div key={inv.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, color: "#064e3b" }}>
                  {inv.invoice_number} <Badge status={inv.status} />
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {inv.vendors?.name} · PO {inv.purchase_orders?.po_number || "—"} · {inv.invoice_date}
                </div>
              </div>
              <button type="button" onClick={() => runMatch(inv.id)} style={btnGhost}>3-way match</button>
            </div>
            {match[inv.id] && (
              <div style={{ padding: "10px 0 0 0" }}>
                <Table
                  headers={["№", "SKU", "Sifariş", "Qəbul", "Faktura", "PO qiymət", "Fakt. qiymət", "Miqdar", "Qiymət", "Nəticə"]}
                  rows={match[inv.id].map(m => [
                    m.line_no ?? "—", m.product_sku ?? "—",
                    fmt(m.qty_ordered), fmt(m.qty_accepted), fmt(m.qty_invoiced),
                    fmt(m.po_unit_price), fmt(m.invoice_unit_price),
                    m.qty_ok ? "✓" : "✗", m.price_ok ? "✓" : "✗",
                    <span key="s" style={{ color: m.status === "matched" ? "#065f46" : "#b91c1c", fontWeight: 600 }}>{m.status}</span>,
                  ])}
                  empty="Sətir yoxdur"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------- shared UI ----------------------
function Table({ headers, rows, empty }) {
  if (!rows.length) return <p style={{ color: "#94a3b8", fontSize: 13 }}>{empty}</p>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>{headers.map(h => <th key={h} style={th}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

const panel = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };
const h3 = { fontFamily: "Sora, sans-serif", fontSize: 16, margin: "0 0 12px", color: "#064e3b" };
const grid4 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 };
const inp = { padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontFamily: "inherit" };
const btnPrimary = { padding: "8px 16px", background: "linear-gradient(135deg,#0d7a5f,#c9a84c)", color: "#fff", border: 0, borderRadius: 8, fontWeight: 600, cursor: "pointer" };
const btnGhost = { padding: "6px 12px", background: "transparent", color: "#0d7a5f", border: "1px solid #0d7a5f", borderRadius: 8, fontSize: 12, cursor: "pointer" };
const th = { textAlign: "left", padding: "8px 10px", background: "#f8fafc", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #e2e8f0" };
const td = { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", color: "#0f172a" };
const errStyle = { color: "#b91c1c", fontSize: 13, marginTop: 8 };
