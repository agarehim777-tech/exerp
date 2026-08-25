import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useCashbook } from "../../shared/hooks/useCashbook.js";
import {
  azn, badge, card, delBtn, input, msgBox, primaryBtn,
  statLabel, statTile, statValue, tabBar, tabBtn, table, td, th,
} from "../../shared/ui/tokens.js";

const ACCOUNT_TYPE = { cash: "Kassa", bank: "Bank", card: "Kart", other: "Digər" };
const EXPENSE_CATEGORIES = ["icarə", "kommunal", "əmək haqqı", "marketinq", "nəqliyyat", "digər"];

export default function CashbookPage({ legacyCashEntries = [] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeMembership, isPlatformAdmin } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const canApproveExpenses = Boolean(isPlatformAdmin || ["owner", "admin", "audit", "auditor"].includes(activeMembership?.role));
  const book = useCashbook(tenantId);
  const [tab, setTab] = useState(() => searchParams.get("tab") || "accounts");
  const [syncError, setSyncError] = useState("");
  const syncedSignature = useRef("");
  const legacyPaymentSignature = useMemo(
    () => legacyCashEntries.map((entry) => `${entry.id}:${entry.amount}`).sort().join("|"),
    [legacyCashEntries],
  );

  useEffect(() => {
    if (!tenantId || book.loading) return;
    const signature = `${tenantId}:${legacyPaymentSignature}`;
    if (syncedSignature.current === signature) return;
    syncedSignature.current = signature;
    setSyncError("");
    (async () => {
      try {
        await book.syncOrderPayments(legacyCashEntries);
        await book.syncExpenseCashImpact();
        setSyncError("");
      } catch (error) {
        syncedSignature.current = "";
        setSyncError(error?.message || "Kassa sinxronizasiyası alınmadı.");
        console.error("Kassa sinxronizasiyası alınmadı:", error);
      }
    })();
  }, [tenantId, legacyPaymentSignature, book.loading]);

  const totals = useMemo(() => {
    const balance = book.accounts.reduce((sum, a) => sum + book.balanceOf(a.id), 0);
    const reversedTransactionIds = new Set(book.transactions.flatMap(transaction => {
      if (transaction.category !== "transaction_reversal" && !transaction.reversal_of) return [];
      const markerId = String(transaction.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
      return [transaction.reversal_of, markerId].filter(Boolean);
    }));
    const externalTransactions = book.transactions.filter(transaction =>
      transaction.category !== "internal_transfer"
      && transaction.category !== "transaction_reversal"
      && !transaction.reversal_of
      && !reversedTransactionIds.has(transaction.id));
    const inflow = externalTransactions.filter((t) => t.direction === "in").reduce((s, t) => s + Number(t.amount), 0);
    const outflow = externalTransactions.filter((t) => t.direction === "out").reduce((s, t) => s + Number(t.amount), 0);
    const pending = book.expenses.filter((e) => ["pending", "draft"].includes(e.status)).length;
    const refundPending = book.expenses.filter((e) => e.status === "refund_pending").reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    return { balance, inflow, outflow, pending, refundPending };
  }, [book]);

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statTile}><div style={statLabel}>Cari qalıq</div><div style={statValue}>{azn(totals.balance)}</div></div>
        <div style={statTile}><div style={statLabel}>Mədaxil</div><div style={statValue}>{azn(totals.inflow)}</div></div>
        <div style={statTile}><div style={statLabel}>Məxaric</div><div style={{ ...statValue, color: "#b23a3a" }}>{azn(totals.outflow)}</div></div>
        <div style={statTile}><div style={statLabel}>Təsdiq gözləyən xərc</div><div style={statValue}>{totals.pending}</div></div>
        <div style={statTile}><div style={statLabel}>Geri qaytarılacaq</div><div style={{ ...statValue, color: totals.refundPending ? "#b45309" : undefined }}>{azn(totals.refundPending)}</div></div>
      </div>

      <div style={tabBar}>
        {[["accounts", "Hesablar"], ["transactions", "Əməliyyatlar"], ["expenses", "Xərclər"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{l}</button>
        ))}
      </div>

      {book.error && <div style={msgBox}>Xəta: {book.error.message}</div>}
      {syncError && <div style={msgBox}>Sinxronizasiya xətası: {syncError}</div>}
      {tab === "accounts" && <AccountsPanel book={book} />}
      {tab === "transactions" && <TransactionsPanel book={book} tenantId={tenantId} />}
      {tab === "expenses" && (
        <ExpensesPanel
          book={book}
          canApprove={canApproveExpenses}
          initialStatus={searchParams.get("status") || ""}
          onFilterApplied={() => setSearchParams({}, { replace: true })}
        />
      )}
    </div>
  );
}

function AccountsPanel({ book }) {
  const [form, setForm] = useState({ name: "", type: "bank", currency: "AZN", account_no: "", opening_balance: "" });
  const [transfer, setTransfer] = useState({ fromAccountId: "", toAccountId: "", amount: "", occurredAt: new Date().toISOString().slice(0, 10), description: "" });
  const [openForm, setOpenForm] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      await book.createAccount(form);
      setForm({ name: "", type: "bank", currency: "AZN", account_no: "", opening_balance: "" });
      setOpenForm("");
    } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Kassa və bank hesabları ({book.accounts.length})</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" style={primaryBtn} onClick={() => setOpenForm(current => current === "account" ? "" : "account")}>+ Yeni kassa</button>
        {book.accounts.length > 1 && <button type="button" style={{ ...primaryBtn, background: "#fff", color: "#075e4b", border: "1px solid #075e4b" }} onClick={() => setOpenForm(current => current === "transfer" ? "" : "transfer")}>↔ Pul transferi</button>}
      </div>
      {openForm === "account" && <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 12, padding: 12, border: "1px solid #d8cda8", borderRadius: 10, background: "#faf8ef" }}>
        <input required placeholder="Hesab adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input}>
          {Object.entries(ACCOUNT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input placeholder="Valyuta" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={input} />
        <input placeholder="Hesab №" value={form.account_no} onChange={(e) => setForm({ ...form, account_no: e.target.value })} style={input} />
        <input type="number" step="0.01" placeholder="Açılış qalığı" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} style={input} />
        <button type="submit" style={primaryBtn}>+ Hesab</button>
      </form>}
      {openForm === "transfer" && book.accounts.length > 1 && <form onSubmit={async event => {
        event.preventDefault(); setMsg("");
        try { await book.transfer(transfer); setTransfer(current => ({ ...current, amount: "", description: "" })); setOpenForm(""); setMsg("Transfer tamamlandı."); }
        catch (error) { setMsg(`Xəta: ${error.message}`); }
      }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, padding: 12, marginBottom: 12, border: "1px solid #d8cda8", borderRadius: 10, background: "#faf8ef" }}>
        <select required value={transfer.fromAccountId} onChange={event => setTransfer({ ...transfer, fromAccountId: event.target.value })} style={input}><option value="">Haradan</option>{book.accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {azn(book.balanceOf(account.id))}</option>)}</select>
        <select required value={transfer.toAccountId} onChange={event => setTransfer({ ...transfer, toAccountId: event.target.value })} style={input}><option value="">Haraya</option>{book.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
        <input required type="number" min="0.01" step="0.01" placeholder="Məbləğ" value={transfer.amount} onChange={event => setTransfer({ ...transfer, amount: event.target.value })} style={input} />
        <input type="date" value={transfer.occurredAt} onChange={event => setTransfer({ ...transfer, occurredAt: event.target.value })} style={input} />
        <input placeholder="Qeyd" value={transfer.description} onChange={event => setTransfer({ ...transfer, description: event.target.value })} style={input} />
        <button type="submit" style={primaryBtn}>Transfer et</button>
      </form>}
      <table style={table}>
        <thead><tr><th style={th}>Ad</th><th style={th}>Növ</th><th style={th}>Valyuta</th><th style={th}>Cari qalıq</th><th style={th} /></tr></thead>
        <tbody>
          {book.accounts.map((a) => (
            <tr key={a.id}>
              <td style={td}><b>{a.name}</b></td>
              <td style={td}>{ACCOUNT_TYPE[a.type]}</td>
              <td style={td}>{a.currency}</td>
              <td style={{ ...td, fontWeight: 600 }}>{azn(book.balanceOf(a.id))}</td>
              <td style={{ ...td, textAlign: "right" }}>{a.name?.trim().toLocaleLowerCase("az") !== "əsas kassa" && <button type="button" style={delBtn} onClick={async () => {
                if (!window.confirm(`${a.name} kassası silinsin?`)) return;
                setMsg("");
                try { await book.removeAccount(a); } catch (error) { setMsg(`Xəta: ${error.message}`); }
              }}>Sil</button>}</td>
            </tr>
          ))}
          {!book.accounts.length && <tr><td style={td} colSpan={5}>Hesab yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsPanel({ book, tenantId }) {
  const [form, setForm] = useState({ account_id: "", direction: "in", amount: "", category: "", customer_id: "", counterparty: "", description: "", occurred_at: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    try { setHiddenIds(new Set(JSON.parse(localStorage.getItem(`erp.cash.hidden.${tenantId}`) || "[]"))); }
    catch { setHiddenIds(new Set()); }
  }, [tenantId]);

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      await book.addTransaction(form);
      setForm({ ...form, amount: "", customer_id: "", counterparty: "", description: "" });
    } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  const employeeByUser = useMemo(() => new Map(book.employees.map(item => [item.user_id, item])), [book.employees]);
  const visibleTransactions = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("az");
    const rows = showHidden ? book.transactions : book.transactions.filter(transaction => !hiddenIds.has(transaction.id));
    if (!needle) return rows;
    return rows.filter(transaction => [
      transaction.transaction_no,
      transaction.customer?.name,
      transaction.vendor?.name,
      transaction.counterparty,
      transaction.reference,
      transaction.category,
      transaction.description,
      transaction.account?.name,
      employeeByUser.get(transaction.created_by)?.full_name,
    ].some(value => String(value || "").toLocaleLowerCase("az").includes(needle)));
  }, [book.transactions, employeeByUser, hiddenIds, search, showHidden]);
  const reversedIds = useMemo(() => new Set(book.transactions.flatMap(item => {
    const markerId = String(item.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
    return [item.reversal_of, markerId].filter(Boolean);
  })), [book.transactions]);

  const reverse = async transaction => {
    const reason = window.prompt(`${transaction.transaction_no || "Əməliyyat"} üçün ləğv səbəbini yazın:`);
    if (reason === null) return;
    setMsg("");
    try {
      await book.removeTransaction(transaction, reason);
      setMsg("Əməliyyat silinmədi, maliyyə auditi qorunaraq əks yazılışla ləğv edildi.");
    } catch (error) {
      setMsg(`Xəta: ${error.message}`);
    }
  };

  const hideCanceled = transaction => {
    if (!window.confirm("Ləğv edilmiş əməliyyat gündəlik siyahıdan silinsin? Maliyyə auditində saxlanılacaq.")) return;
    const pairIds = book.transactions.filter(item => {
      const markerId = String(item.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
      return item.id === transaction.id || item.reversal_of === transaction.id || markerId === transaction.id;
    }).map(item => item.id);
    const next = new Set([...hiddenIds, transaction.id, ...pairIds]);
    setHiddenIds(next);
    localStorage.setItem(`erp.cash.hidden.${tenantId}`, JSON.stringify([...next]));
    setMsg("Ləğv edilmiş əməliyyat cədvəldən silindi. Audit məlumatı qorunur.");
  };

  const restoreHidden = transaction => {
    const originalId = transaction.reversal_of || String(transaction.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1] || transaction.id;
    const pairIds = book.transactions.filter(item => {
      const markerId = String(item.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
      return item.id === originalId || item.reversal_of === originalId || markerId === originalId;
    }).map(item => item.id);
    const next = new Set([...hiddenIds].filter(id => !pairIds.includes(id)));
    setHiddenIds(next);
    localStorage.setItem(`erp.cash.hidden.${tenantId}`, JSON.stringify([...next]));
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Kassa əməliyyatları</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8, marginBottom: 16 }}>
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
        <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value, counterparty: "" })} style={input}>
          <option value="">Müştəri seç (istəyə bağlı)</option>
          {book.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.fin ? ` · ${customer.fin}` : ""}</option>)}
        </select>
        <input disabled={Boolean(form.customer_id)} placeholder={form.direction === "in" ? "Ödəyən şəxsin ad-soyadı" : "Ödənişi alanın ad-soyadı"} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })} style={input} />
        <input placeholder="Qeyd / izah" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={input} />
        <input type="date" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} style={input} />
        <button type="submit" disabled={!book.accounts.length} style={primaryBtn}>+ Qeyd et</button>
      </form>
      {!book.accounts.length && <div style={msgBox}>Əvvəlcə «Hesablar» bölməsindən kassa/bank hesabı yaradın.</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <b>{visibleTransactions.length} əməliyyat</b>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {hiddenIds.size > 0 && <button type="button" className="secondary-btn" onClick={() => setShowHidden(value => !value)}>{showHidden ? "Aktiv siyahı" : `Silinmişləri göstər (${hiddenIds.size})`}</button>}
          <input aria-label="Kassa əməliyyatlarında axtarış" placeholder="Ad, sənəd, kateqoriya və ya qeyd üzrə axtar..." value={search} onChange={event => setSearch(event.target.value)} style={{ ...input, width: "min(100%, 380px)" }} />
        </div>
      </div>
      <div style={{ overflowX: "auto" }}><table style={{ ...table, minWidth: 1120 }}>
        <thead><tr><th style={th}>Tarix</th><th style={th}>Əməliyyat №</th><th style={th}>Hesab</th><th style={th}>Növ</th><th style={th}>Məbləğ</th><th style={th}>Ödəyən / qarşı tərəf</th><th style={th}>Bağlı sənəd</th><th style={th}>Kateqoriya</th><th style={th}>Daxil edən</th><th style={th}>Qeyd</th><th style={th} /></tr></thead>
        <tbody>
          {visibleTransactions.map((t) => {
            const employee = employeeByUser.get(t.created_by);
            const partyName = t.customer?.name || t.vendor?.name || t.counterparty || "—";
            return (
            <tr key={t.id}>
              <td style={td}>{new Date(t.occurred_at).toLocaleDateString("az-AZ")}</td>
              <td style={td}><b>{t.transaction_no || "—"}</b></td>
              <td style={td}>{t.account?.name || "—"}</td>
              <td style={td}><span style={badge(t.category === "internal_transfer" ? "gray" : t.direction === "in" ? "green" : "red")}>{t.category === "internal_transfer" ? "Daxili transfer" : t.direction === "in" ? "Mədaxil" : "Məxaric"}</span></td>
              <td style={{ ...td, fontWeight: 600 }}>{azn(t.amount)}</td>
              <td style={td}><b>{partyName}</b>{t.customer?.fin && <div style={{ color: "#64748b", fontSize: 12 }}>FİN: {t.customer.fin}</div>}</td>
              <td style={td}>{t.reference || "—"}</td>
              <td style={td}>{t.category || "—"}</td>
              <td style={td}>{employee?.full_name || "Sistem"}{employee?.position && <div style={{ color: "#64748b", fontSize: 12 }}>{employee.position}</div>}</td>
              <td style={{ ...td, maxWidth: 260, whiteSpace: "normal" }}>{t.description || "—"}</td>
              <td style={td}>{showHidden && hiddenIds.has(t.id)
                ? <button className="secondary-btn" type="button" onClick={() => restoreHidden(t)}>Bərpa et</button>
                : t.reversal_of
                ? <span style={badge("gray")}>Reversal</span>
                : reversedIds.has(t.id)
                  ? <div style={{display:"grid",gap:5}}><span style={badge("gray")}>Ləğv edilib</span><button style={delBtn} type="button" onClick={() => hideCanceled(t)}>Siyahıdan sil</button></div>
                  : <button style={delBtn} onClick={() => reverse(t)}>Ləğv et</button>}</td>
            </tr>
          );})}
          {!visibleTransactions.length && <tr><td style={td} colSpan={11}>{book.transactions.length ? "Axtarışa uyğun əməliyyat yoxdur." : "Əməliyyat yoxdur."}</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

function ExpensesPanel({ book, canApprove, initialStatus = "", onFilterApplied }) {
  const [form, setForm] = useState({ account_id: "", category: "digər", description: "", amount: "", vat_amount: "", expense_date: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [openCategories, setOpenCategories] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [filters, setFilters] = useState({ search: "", category: "", status: initialStatus, dateFrom: "", dateTo: "" });
  useEffect(() => {
    if (!initialStatus) return;
    setFilters(current => ({ ...current, status: initialStatus }));
    onFilterApplied?.();
  }, [initialStatus]);
  const categoryNames = book.expenseCategories.map(item => item.name);
  const visibleExpenses = book.expenses.filter(expense => {
    const search = filters.search.trim().toLocaleLowerCase("az");
    const statusGroup = ["pending", "draft"].includes(expense.status) ? "pending" : ["approved", "paid"].includes(expense.status) ? "approved" : expense.status;
    return (!search || `${expense.description || ""} ${expense.category || ""}`.toLocaleLowerCase("az").includes(search))
      && (!filters.category || expense.category === filters.category)
      && (!filters.status || statusGroup === filters.status)
      && (!filters.dateFrom || String(expense.expense_date || "").slice(0, 10) >= filters.dateFrom)
      && (!filters.dateTo || String(expense.expense_date || "").slice(0, 10) <= filters.dateTo);
  });

  const submit = async (event) => {
    event.preventDefault();
    setMsg("");
    try {
      await book.addExpense(form);
      setForm({ ...form, description: "", amount: "", vat_amount: "" });
      setOpenCreate(false);
    } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Xərclər ({book.expenses.length})</h3>
      {msg && <div style={msgBox}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" style={primaryBtn} onClick={() => setOpenCreate(value => !value)}>+ Yeni xərc</button>
        <button type="button" style={{ ...primaryBtn, background: "#fff", color: "#075e4b", border: "1px solid #075e4b" }} onClick={() => setOpenCategories(value => !value)}>Kateqoriyalar</button>
      </div>
      {openCategories && <div style={{ padding: 12, marginBottom: 12, border: "1px solid #d8cda8", borderRadius: 10, background: "#faf8ef" }}>
        <form onSubmit={async event => { event.preventDefault(); setMsg(""); try { if (editingCategory) await book.updateExpenseCategory(editingCategory, categoryName); else await book.createExpenseCategory(categoryName); setCategoryName(""); setEditingCategory(null); } catch (error) { setMsg(`Xəta: ${error.message}`); } }} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input required value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="Kateqoriya adı" style={{ ...input, flex: 1 }} />
          <button type="submit" style={primaryBtn}>{editingCategory ? "Yadda saxla" : "+ Kateqoriya"}</button>
          {editingCategory && <button type="button" style={delBtn} onClick={() => { setEditingCategory(null); setCategoryName(""); }}>Ləğv et</button>}
        </form>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{book.expenseCategories.map(category => <div key={category.id} style={{ display: "flex", gap: 5, alignItems: "center", padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}><span>{category.name}</span><button type="button" className="text-btn" onClick={() => { setEditingCategory(category); setCategoryName(category.name); }}>Düzəlt</button><button type="button" style={delBtn} onClick={async () => { if (!window.confirm(`${category.name} kateqoriyası silinsin?`)) return; try { await book.removeExpenseCategory(category); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Sil</button></div>)}</div>
      </div>}
      {openCreate && <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16, padding: 12, border: "1px solid #d8cda8", borderRadius: 10, background: "#faf8ef" }}>
        <select required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} style={input}>
          <option value="">Kassa seçin</option>
          {book.accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {azn(book.balanceOf(account.id))}</option>)}
        </select>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={input}>
          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input required placeholder="Təsvir" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={input} />
        <input required type="number" step="0.01" placeholder="Məbləğ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={input} />
        <input type="number" step="0.01" placeholder="ƏDV" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })} style={input} />
        <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} style={input} />
        <button type="submit" style={primaryBtn}>+ Xərc</button>
      </form>}
      {editing && <form onSubmit={async event => {
        event.preventDefault(); setMsg("");
        try { await book.updateExpense(editing.original, editing.values); setEditing(null); setMsg("Xərc və kassa əməliyyatı yeniləndi."); }
        catch (error) { setMsg(`Xəta: ${error.message}`); }
      }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, padding: 12, marginBottom: 16, border: "1px solid #d8cda8", borderRadius: 10, background: "#faf8ef" }}>
        <select required value={editing.values.account_id || ""} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, account_id: event.target.value } }))} style={input}><option value="">Kassa seçin</option>{book.accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {azn(book.balanceOf(account.id))}</option>)}</select>
        <select value={editing.values.category} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, category: event.target.value } }))} style={input}>{categoryNames.map(category => <option key={category}>{category}</option>)}</select>
        <input required value={editing.values.description || ""} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, description: event.target.value } }))} style={input} placeholder="Təsvir" />
        <input required type="number" min="0.01" step="0.01" value={editing.values.amount} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, amount: event.target.value } }))} style={input} placeholder="Məbləğ" />
        <input type="number" step="0.01" value={editing.values.vat_amount || ""} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, vat_amount: event.target.value } }))} style={input} placeholder="ƏDV" />
        <input type="date" value={editing.values.expense_date} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, expense_date: event.target.value } }))} style={input} />
        <button type="submit" style={primaryBtn}>Dəyişiklikləri saxla</button>
        <button type="button" style={{ ...primaryBtn, background: "#fff", color: "#475569", border: "1px solid #cbd5e1" }} onClick={() => setEditing(null)}>Bağla</button>
      </form>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8, marginBottom: 12, width: "100%" }}>
        <input value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Axtar…" style={{ ...input, minWidth: 0, boxSizing: "border-box" }} />
        <select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value })} style={{ ...input, minWidth: 0, boxSizing: "border-box" }}><option value="">Bütün kateqoriyalar</option>{categoryNames.map(category => <option key={category}>{category}</option>)}</select>
        <select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} style={{ ...input, minWidth: 0, boxSizing: "border-box" }}><option value="">Bütün statuslar</option><option value="pending">Təsdiq gözləyir</option><option value="approved">Təsdiqləndi</option><option value="refund_pending">Geri qaytarma gözləyir</option><option value="cancelled">Ləğv edildi</option></select>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, fontSize: 10, color: "#64748b" }}><span>Başlanğıc tarixi</span><input type="date" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })} style={{ ...input, minWidth: 0, boxSizing: "border-box" }} /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, fontSize: 10, color: "#64748b" }}><span>Bitmə tarixi</span><input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={event => setFilters({ ...filters, dateTo: event.target.value })} style={{ ...input, minWidth: 0, boxSizing: "border-box" }} /></label>
        <button type="button" style={{ ...primaryBtn, minWidth: 0, alignSelf: "end", background: "#fff", color: "#475569", border: "1px solid #cbd5e1" }} onClick={() => setFilters({ search: "", category: "", status: "", dateFrom: "", dateTo: "" })}>Təmizlə</button>
      </div>
      <table style={table}>
        <thead><tr><th style={th}>Tarix</th><th style={th}>Kateqoriya</th><th style={th}>Təsvir</th><th style={th}>Məbləğ</th><th style={th}>Status</th><th style={th} /></tr></thead>
        <tbody>
          {visibleExpenses.map((e) => (
            <tr key={e.id}>
              <td style={td}>{new Date(e.expense_date).toLocaleDateString("az-AZ")}</td>
              <td style={td}>{e.category}</td>
              <td style={td}>{e.description || "—"}</td>
              <td style={{ ...td, fontWeight: 600 }}>{azn(e.amount)}</td>
              <td style={td}><span style={badge(["approved", "paid", "cancelled"].includes(e.status) ? "green" : e.status === "refund_pending" ? "red" : "amber")}>{["approved", "paid"].includes(e.status) ? "Təsdiqləndi" : e.status === "cancelled" ? "Ləğv edildi / qaytarıldı" : e.status === "refund_pending" ? "Geri qaytarma gözləyir" : "Təsdiq gözləyir"}</span></td>
              <td style={td}>
                {["pending", "draft"].includes(e.status) && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button style={{ ...primaryBtn, background: "#fff", color: "#075e4b", border: "1px solid #075e4b" }} onClick={() => setEditing({ original: e, values: { account_id: e.account_id || "", category: e.category, description: e.description || "", amount: e.amount, vat_amount: e.vat_amount || "", expense_date: e.expense_date } })}>Redaktə et</button>
                  <button style={delBtn} onClick={async () => { if (!window.confirm("Xərc silinsin və məbləğ kassaya qaytarılsın?")) return; setMsg(""); try { await book.removeExpense(e); if (editing?.original?.id === e.id) setEditing(null); setMsg("Xərc silindi və məbləğ kassaya qaytarıldı."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Sil</button>
                  {canApprove && <>
                  <button style={primaryBtn} onClick={async () => { setMsg(""); try { await book.approveExpense(e); setMsg("Xərc audit tərəfindən təsdiqləndi."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Təsdiqlə</button>
                  <button style={delBtn} onClick={async () => { setMsg(""); try { await book.rejectExpense(e.id); setMsg("Xərc ləğv edildi, məbləğ geri qaytarma növbəsinə düşdü."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Ləğv et</button>
                  </>}
                </div>}
                {canApprove && ["approved", "paid"].includes(e.status) && <button style={delBtn} onClick={async () => { setMsg(""); try { await book.rejectExpense(e.id); setMsg("Xərc ləğv edildi, məbləğ geri qaytarma növbəsinə düşdü."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Ləğv et</button>}
                {canApprove && e.status === "refund_pending" && <button style={primaryBtn} onClick={async () => { setMsg(""); try { await book.approveExpenseRefund(e); setMsg("Ləğv edilmiş məbləğ kassaya qaytarıldı."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Məbləği kassaya qaytar</button>}
              </td>
            </tr>
          ))}
          {!visibleExpenses.length && <tr><td style={td} colSpan={6}>Filterə uyğun xərc yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
