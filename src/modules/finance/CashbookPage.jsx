import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useCashbook } from "../../shared/hooks/useCashbook.js";
import {
  azn, badge, card, delBtn, input, msgBox, primaryBtn,
  statLabel, statTile, statValue, tabBar, tabBtn, table, td, th,
} from "../../shared/ui/tokens.js";

const ACCOUNT_TYPE = { cash: "Kassa", bank: "Bank", card: "Kart", other: "Digər" };
const EXPENSE_CATEGORIES = ["icarə", "kommunal", "əmək haqqı", "marketinq", "nəqliyyat", "digər"];

export default function CashbookPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const book = useCashbook(tenantId);
  const [tab, setTab] = useState("accounts");

  const totals = useMemo(() => {
    const balance = book.accounts.reduce((sum, a) => sum + book.balanceOf(a.id), 0);
    const inflow = book.transactions.filter((t) => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
    const outflow = book.transactions.filter((t) => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0);
    const pending = book.expenses.filter((e) => e.status !== "approved" && e.status !== "paid").length;
    return { balance, inflow, outflow, pending };
  }, [book]);

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statTile}><div style={statLabel}>Cari qalıq</div><div style={statValue}>{azn(totals.balance)}</div></div>
        <div style={statTile}><div style={statLabel}>Mədaxil</div><div style={statValue}>{azn(totals.inflow)}</div></div>
        <div style={statTile}><div style={statLabel}>Məxaric</div><div style={{ ...statValue, color: "#b23a3a" }}>{azn(totals.outflow)}</div></div>
        <div style={statTile}><div style={statLabel}>Təsdiq gözləyən xərc</div><div style={statValue}>{totals.pending}</div></div>
      </div>

      <div style={tabBar}>
        {[["accounts", "Hesablar"], ["transactions", "Əməliyyatlar"], ["expenses", "Xərclər"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{l}</button>
        ))}
      </div>

      {book.error && <div style={msgBox}>Xəta: {book.error.message}</div>}
      {tab === "accounts" && <AccountsPanel book={book} />}
      {tab === "transactions" && <TransactionsPanel book={book} />}
      {tab === "expenses" && <ExpensesPanel book={book} />}
    </div>
  );
}

function AccountsPanel({ book }) {
  const [form, setForm] = useState({ name: "", type: "bank", currency: "AZN", account_no: "", opening_balance: "" });
  const [msg, setMsg] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      await book.createAccount(form);
      setForm({ name: "", type: "bank", currency: "AZN", account_no: "", opening_balance: "" });
    } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Kassa və bank hesabları ({book.accounts.length})</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input required placeholder="Hesab adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input}>
          {Object.entries(ACCOUNT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input placeholder="Valyuta" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={input} />
        <input placeholder="Hesab №" value={form.account_no} onChange={(e) => setForm({ ...form, account_no: e.target.value })} style={input} />
        <input type="number" step="0.01" placeholder="Açılış qalığı" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} style={input} />
        <button type="submit" style={primaryBtn}>+ Hesab</button>
      </form>
      <table style={table}>
        <thead><tr><th style={th}>Ad</th><th style={th}>Növ</th><th style={th}>Valyuta</th><th style={th}>Cari qalıq</th></tr></thead>
        <tbody>
          {book.accounts.map((a) => (
            <tr key={a.id}>
              <td style={td}><b>{a.name}</b></td>
              <td style={td}>{ACCOUNT_TYPE[a.type]}</td>
              <td style={td}>{a.currency}</td>
              <td style={{ ...td, fontWeight: 600 }}>{azn(book.balanceOf(a.id))}</td>
            </tr>
          ))}
          {!book.accounts.length && <tr><td style={td} colSpan={4}>Hesab yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsPanel({ book }) {
  const [form, setForm] = useState({ account_id: "", direction: "in", amount: "", category: "", counterparty: "", description: "", occurred_at: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      await book.addTransaction(form);
      setForm({ ...form, amount: "", counterparty: "", description: "" });
    } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Kassa əməliyyatları</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
        <select required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} style={input}>
          <option value="">Hesab seç…</option>
          {book.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} style={input}>
          <option value="in">Mədaxil</option>
          <option value="out">Məxaric</option>
        </select>
        <input required type="number" step="0.01" placeholder="Məbləğ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={input} />
        <input placeholder="Kateqoriya" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={input} />
        <input placeholder="Qarşı tərəf" value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} style={input} />
        <input type="date" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} style={input} />
        <button type="submit" disabled={!book.accounts.length} style={primaryBtn}>+ Qeyd et</button>
      </form>
      {!book.accounts.length && <div style={msgBox}>Əvvəlcə «Hesablar» bölməsindən kassa/bank hesabı yaradın.</div>}
      <table style={table}>
        <thead><tr><th style={th}>Tarix</th><th style={th}>Hesab</th><th style={th}>Növ</th><th style={th}>Məbləğ</th><th style={th}>Qarşı tərəf</th><th style={th} /></tr></thead>
        <tbody>
          {book.transactions.map((t) => (
            <tr key={t.id}>
              <td style={td}>{new Date(t.occurred_at).toLocaleDateString("az-AZ")}</td>
              <td style={td}>{t.account?.name || "—"}</td>
              <td style={td}><span style={badge(t.direction === "in" ? "green" : "red")}>{t.direction === "in" ? "Mədaxil" : "Məxaric"}</span></td>
              <td style={{ ...td, fontWeight: 600 }}>{azn(t.amount)}</td>
              <td style={td}>{t.counterparty || t.description || "—"}</td>
              <td style={td}><button style={delBtn} onClick={() => window.confirm("Silinsin?") && book.removeTransaction(t.id)}>Sil</button></td>
            </tr>
          ))}
          {!book.transactions.length && <tr><td style={td} colSpan={6}>Əməliyyat yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ExpensesPanel({ book }) {
  const [form, setForm] = useState({ category: "digər", description: "", amount: "", vat_amount: "", expense_date: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      await book.addExpense(form);
      setForm({ ...form, description: "", amount: "", vat_amount: "" });
    } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Xərclər ({book.expenses.length})</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={input}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input required placeholder="Təsvir" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={input} />
        <input required type="number" step="0.01" placeholder="Məbləğ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={input} />
        <input type="number" step="0.01" placeholder="ƏDV" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })} style={input} />
        <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} style={input} />
        <button type="submit" style={primaryBtn}>+ Xərc</button>
      </form>
      <table style={table}>
        <thead><tr><th style={th}>Tarix</th><th style={th}>Kateqoriya</th><th style={th}>Təsvir</th><th style={th}>Məbləğ</th><th style={th}>Status</th><th style={th} /></tr></thead>
        <tbody>
          {book.expenses.map((e) => (
            <tr key={e.id}>
              <td style={td}>{new Date(e.expense_date).toLocaleDateString("az-AZ")}</td>
              <td style={td}>{e.category}</td>
              <td style={td}>{e.description || "—"}</td>
              <td style={{ ...td, fontWeight: 600 }}>{azn(e.amount)}</td>
              <td style={td}><span style={badge(e.status === "approved" ? "green" : e.status === "paid" ? "green" : "amber")}>{e.status}</span></td>
              <td style={td}>
                {e.status !== "approved" && (
                  <button style={primaryBtn} onClick={() => book.setExpenseStatus(e.id, "approved")}>Təsdiqlə</button>
                )}
              </td>
            </tr>
          ))}
          {!book.expenses.length && <tr><td style={td} colSpan={6}>Xərc yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
