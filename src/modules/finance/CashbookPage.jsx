import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useCashbook } from "../../shared/hooks/useCashbook.js";
import { appConfirm, appPrompt } from "../../shared/ui/dialogService.js";
import { cashAmount } from "../../services/format.js";
import { Button, DataTable, Input, Select, Tabs } from '../../shared/ui/primitives.tsx';
import { usePageQuery } from '../../shared/hooks/usePageQuery.jsx';
import { toLocalIsoDate } from "../../services/date.js";

const ACCOUNT_TYPE = { cash: "Kassa", bank: "Bank", card: "Kart", other: "Digər" };
const EXPENSE_CATEGORIES = ["icarə", "kommunal", "əmək haqqı", "marketinq", "nəqliyyat", "digər"];

export default function CashbookPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeMembership, isPlatformAdmin } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const canApproveExpenses = Boolean(isPlatformAdmin || ["owner", "admin", "audit", "auditor"].includes(activeMembership?.role));
  const book = useCashbook(tenantId);
  const tab = ['accounts', 'transactions', 'expenses'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'accounts';
  const setTab = value => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    next.set('tab', value);
    next.delete('status');
    return next;
  });

  const [currency, setCurrency] = useState("AZN");
  const currencies = book.summary?.currencies || [];
  const selectedCurrency = currencies.some(item => item.currency === currency) ? currency : currencies[0]?.currency || "AZN";
  const totals = currencies.find(item => item.currency === selectedCurrency) || null;

  if (!tenantId) return <div className="ui-card">Aktiv şirkət seçilməyib.</div>;

  return (
    <div className="ui-page-stack">
      <Select aria-label="Hesabat valyutası" value={selectedCurrency} onChange={event => setCurrency(event.target.value)}  disabled={!book.ledgerReady}>
        {(currencies.length ? currencies : [{ currency: "AZN" }]).map(item => <option key={item.currency}>{item.currency}</option>)}
      </Select>
      <div className="ui-table-actions ui-spacer-bottom">
        <div className="ui-stat-card"><div className="ui-stat-label">Cari qalıq</div><div className="ui-stat-value">{cashAmount(totals?.balance ?? null, selectedCurrency)}</div></div>
        <div className="ui-stat-card"><div className="ui-stat-label">Mədaxil</div><div className="ui-stat-value">{cashAmount(totals?.inflow ?? null, selectedCurrency)}</div></div>
        <div className="ui-stat-card"><div className="ui-stat-label">Məxaric</div><div className="ui-stat-value amount-due">{cashAmount(totals?.outflow ?? null, selectedCurrency)}</div></div>
        <div className="ui-stat-card"><div className="ui-stat-label">Təsdiq gözləyən xərc</div><div className="ui-stat-value">{totals?.pending ?? "—"}</div></div>
        <div className="ui-stat-card"><div className="ui-stat-label">Geri qaytarılacaq</div><div className={`ui-stat-value ${totals?.refundPending ? "amount-due" : ""}`}>{cashAmount(totals?.refundPending ?? null, selectedCurrency)}</div></div>
      </div>

      <Tabs items={[["accounts", "Hesablar"], ["transactions", "Əməliyyatlar"], ["expenses", "Xərclər"]]} value={tab} onChange={setTab} />

      {book.error && <div className="ui-notice ui-notice-warning">Xəta: {book.error.message}</div>}
      {tab === "accounts" && <AccountsPanel book={book} />}
      {tab === "transactions" && <TransactionsPanel book={book} tenantId={tenantId} />}
      {tab === "expenses" && (
        <ExpensesPanel
          book={book}
          canApprove={canApproveExpenses}
        />
      )}
    </div>
  );
}

function AccountsPanel({ book }) {
  const [form, setForm] = useState({ name: "", type: "bank", currency: "AZN", account_no: "", opening_balance: "" });
  const [transfer, setTransfer] = useState({ fromAccountId: "", toAccountId: "", amount: "", occurredAt: toLocalIsoDate(), description: "" });
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
    <div className="ui-card">
      <h3 className="ui-section-title">Kassa və bank hesabları ({book.accounts.length})</h3>
      {msg && <div className="ui-notice ui-notice-warning">{msg}</div>}
      <div className="ui-table-actions ui-spacer-bottom">
        <Button type="button"  onClick={() => setOpenForm(current => current === "account" ? "" : "account")}>+ Yeni kassa</Button>
        {book.accounts.length > 1 && <Button type="button" variant="secondary" onClick={() => setOpenForm(current => current === "transfer" ? "" : "transfer")}>↔ Pul transferi</Button>}
      </div>
      {openForm === "account" && <form onSubmit={submit} className="ui-form-grid ui-form-surface">
        <Input required placeholder="Hesab adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}  />
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} >
          {Object.entries(ACCOUNT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <Input placeholder="Valyuta" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}  />
        <Input placeholder="Hesab №" value={form.account_no} onChange={(e) => setForm({ ...form, account_no: e.target.value })}  />
        <Input type="number" step="0.01" placeholder="Açılış qalığı" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}  />
        <Button type="submit" >+ Hesab</Button>
      </form>}
      {openForm === "transfer" && book.accounts.length > 1 && <form onSubmit={async event => {
        event.preventDefault(); setMsg("");
        try { await book.transfer(transfer); setTransfer(current => ({ ...current, amount: "", description: "" })); setOpenForm(""); setMsg("Transfer tamamlandı."); }
        catch (error) { setMsg(`Xəta: ${error.message}`); }
      }} className="ui-form-grid ui-form-surface">
        <Select required value={transfer.fromAccountId} onChange={event => setTransfer({ ...transfer, fromAccountId: event.target.value })} ><option value="">Haradan</option>{book.accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {cashAmount(book.balanceOf(account.id), account.currency)}</option>)}</Select>
        <Select required value={transfer.toAccountId} onChange={event => setTransfer({ ...transfer, toAccountId: event.target.value })} ><option value="">Haraya</option>{book.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select>
        <Input required type="number" min="0.01" step="0.01" placeholder="Məbləğ" value={transfer.amount} onChange={event => setTransfer({ ...transfer, amount: event.target.value })}  />
        <Input type="date" value={transfer.occurredAt} onChange={event => setTransfer({ ...transfer, occurredAt: event.target.value })}  />
        <Input placeholder="Qeyd" value={transfer.description} onChange={event => setTransfer({ ...transfer, description: event.target.value })}  />
        <Button type="submit" >Transfer et</Button>
      </form>}
      <DataTable label="Kassa və bank hesabları" rows={book.accounts} emptyText="Hesab yoxdur."
        columns={[{key:'name',label:'Ad',sticky:true},{key:'type',label:'Növ',mobileHidden:true},{key:'currency',label:'Valyuta',mobileHidden:true},{key:'balance',label:'Cari qalıq',align:'right'},{key:'action',label:'Əməl.'}]}
        renderCell={(a, column) => {
          switch (column.key) {
            case 'name': return <b>{a.name}</b>;
            case 'type': return ACCOUNT_TYPE[a.type];
            case 'currency': return a.currency;
            case 'balance': return <b className="money-value">{cashAmount(book.balanceOf(a.id), a.currency)}</b>;
            case 'action': return a.name?.trim().toLocaleLowerCase("az") !== "əsas kassa" && <Button type="button" variant="danger" onClick={async () => {
                if (!(await appConfirm(`${a.name} kassası silinsin?`, { danger: true }))) return;
                setMsg("");
                try { await book.removeAccount(a); } catch (error) { setMsg(`Xəta: ${error.message}`); }
              }}>Sil</Button>;
            default: return null;
          }
        }} />
    </div>
  );
}

function TransactionsPanel({ book, tenantId }) {
  const [form, setForm] = useState({ account_id: "", direction: "in", amount: "", category: "", customer_id: "", counterparty: "", description: "", occurred_at: toLocalIsoDate() });
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [hiddenIds, setHiddenIds] = useState(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const hiddenStorageKey = tenantId ? `erp.cash.hidden.${tenantId}` : null;
  const persistHidden = (next) => {
    setHiddenIds(next);
    if (!hiddenStorageKey) return;
    try { window.localStorage.setItem(hiddenStorageKey, JSON.stringify([...next])); } catch { /* storage unavailable */ }
  };

  useEffect(() => {
    if (!hiddenStorageKey) { setHiddenIds(new Set()); return; }
    try {
      const raw = window.localStorage.getItem(hiddenStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setHiddenIds(new Set(Array.isArray(parsed) ? parsed : []));
    } catch { setHiddenIds(new Set()); }
  }, [hiddenStorageKey]);

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
    const reason = await appPrompt(`${transaction.transaction_no || "Əməliyyat"} üçün ləğv səbəbini yazın:`);
    if (reason === null) return;
    setMsg("");
    try {
      await book.removeTransaction(transaction, reason);
      setMsg("Əməliyyat silinmədi, maliyyə auditi qorunaraq əks yazılışla ləğv edildi.");
    } catch (error) {
      setMsg(`Xəta: ${error.message}`);
    }
  };

  const hideCanceled = async transaction => {
    if (!(await appConfirm("Ləğv edilmiş əməliyyat gündəlik siyahıdan silinsin? Maliyyə auditində saxlanılacaq."))) return;
    const pairIds = book.transactions.filter(item => {
      const markerId = String(item.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
      return item.id === transaction.id || item.reversal_of === transaction.id || markerId === transaction.id;
    }).map(item => item.id);
    const next = new Set([...hiddenIds, transaction.id, ...pairIds]);
    persistHidden(next);
    setMsg("Ləğv edilmiş əməliyyat cədvəldən silindi. Audit məlumatı qorunur.");
  };

  const restoreHidden = transaction => {
    const originalId = transaction.reversal_of || String(transaction.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1] || transaction.id;
    const pairIds = book.transactions.filter(item => {
      const markerId = String(item.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
      return item.id === originalId || item.reversal_of === originalId || markerId === originalId;
    }).map(item => item.id);
    const next = new Set([...hiddenIds].filter(id => !pairIds.includes(id)));
    persistHidden(next);
  };

  return (
    <div className="ui-card">
      <h3 className="ui-section-title">Kassa əməliyyatları</h3>
      {msg && <div className="ui-notice ui-notice-warning">{msg}</div>}
      <form onSubmit={submit} className="ui-form-grid ui-form-surface">
        <Select required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} >
          <option value="">Hesab seç…</option>
          {book.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })} >
          <option value="in">Mədaxil</option>
          <option value="out">Məxaric</option>
        </Select>
        <Input required type="number" step="0.01" placeholder="Məbləğ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}  />
        <Input placeholder="Kateqoriya" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}  />
        <Select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value, counterparty: "" })} >
          <option value="">Müştəri seç (istəyə bağlı)</option>
          {book.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.fin ? ` · ${customer.fin}` : ""}</option>)}
        </Select>
        <Input disabled={Boolean(form.customer_id)} placeholder={form.direction === "in" ? "Ödəyən şəxsin ad-soyadı" : "Ödənişi alanın ad-soyadı"} value={form.counterparty} onChange={(e) => setForm({ ...form, counterparty: e.target.value })}  />
        <Input placeholder="Qeyd / izah" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}  />
        <Input type="date" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}  />
        <Button type="submit" disabled={!book.accounts.length} >+ Qeyd et</Button>
      </form>
      {!book.accounts.length && <div className="ui-notice ui-notice-warning">Əvvəlcə «Hesablar» bölməsindən kassa/bank hesabı yaradın.</div>}
      <div className="ui-toolbar ui-spacer-bottom">
        <b>{visibleTransactions.length} əməliyyat</b>
        <div className="ui-table-actions ui-spacer-bottom">
          {hiddenIds.size > 0 && <Button type="button" variant="secondary" onClick={() => setShowHidden(value => !value)}>{showHidden ? "Aktiv siyahı" : `Silinmişləri göstər (${hiddenIds.size})`}</Button>}
          <Input aria-label="Kassa əməliyyatlarında axtarış" placeholder="Ad, sənəd, kateqoriya və ya qeyd üzrə axtar..." value={search} onChange={event => setSearch(event.target.value)}  />
        </div>
      </div>
      <DataTable label="Kassa əməliyyatları" rows={visibleTransactions}
        emptyText={book.transactions.length ? "Axtarışa uyğun əməliyyat yoxdur." : "Əməliyyat yoxdur."}
        columns={[
          { key: 'date', label: 'Tarix', nowrap: true }, { key: 'number', label: 'Əməliyyat №', sticky: true },
          { key: 'account', label: 'Hesab' }, { key: 'type', label: 'Növ' },
          { key: 'amount', label: 'Məbləğ', align: 'right' }, { key: 'party', label: 'Ödəyən / qarşı tərəf' },
          { key: 'reference', label: 'Bağlı sənəd' }, { key: 'category', label: 'Kateqoriya' },
          { key: 'employee', label: 'Daxil edən' }, { key: 'description', label: 'Qeyd', minWidth: 200 },
          { key: 'actions', label: 'Əməl.' },
        ]}
        renderCell={(t, column) => {
            const employee = employeeByUser.get(t.created_by);
            const partyName = t.customer?.name || t.vendor?.name || t.counterparty || "—";
            switch (column.key) {
              case 'date': return new Date(t.occurred_at).toLocaleDateString("az-AZ");
              case 'number': return <b>{t.transaction_no || "—"}</b>;
              case 'account': return t.account?.name || "—";
              case 'type': return <span className={`ui-badge ui-badge-${t.category === "internal_transfer" ? "neutral" : t.direction === "in" ? "success" : "danger"}`}>{t.category === "internal_transfer" ? "Daxili transfer" : t.direction === "in" ? "Mədaxil" : "Məxaric"}</span>;
              case 'amount': return <b className="money-value">{cashAmount(t.amount, t.account?.currency || 'AZN')}</b>;
              case 'party': return <><b>{partyName}</b>{t.customer?.fin && <div className="muted">FİN: {t.customer.fin}</div>}</>;
              case 'reference': return t.reference || "—";
              case 'category': return t.category || "—";
              case 'employee': return <>{employee?.full_name || "Sistem"}{employee?.position && <div className="muted">{employee.position}</div>}</>;
              case 'description': return t.description || "—";
              case 'actions': return showHidden && hiddenIds.has(t.id)
                ? <Button variant="secondary" type="button" onClick={() => restoreHidden(t)}>Bərpa et</Button>
                : t.reversal_of
                ? <span className={`ui-badge ui-badge-${"neutral"}`}>Reversal</span>
                : reversedIds.has(t.id)
                  ? <div className="ui-page-stack"><span className={`ui-badge ui-badge-${"neutral"}`}>Ləğv edilib</span><Button variant="danger" type="button" onClick={() => hideCanceled(t)}>Siyahıdan sil</Button></div>
                  : <Button variant="danger" onClick={() => reverse(t)}>Ləğv et</Button>;
              default: return null;
            }
        }} />
    </div>
  );
}

function ExpensesPanel({ book, canApprove }) {
  const [form, setForm] = useState({ account_id: "", category: "digər", description: "", amount: "", vat_amount: "", expense_date: toLocalIsoDate() });
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [openCategories, setOpenCategories] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [filters, updateFilters] = usePageQuery({ search: "", category: "", status: "", dateFrom: "", dateTo: "" });
  const setFilters = values => updateFilters(values, { replace: true });
  const categoryNames = book.expenseCategories.map(item => item.name);
  const visibleExpenses = book.expenses.filter(expense => {
    const search = filters.search.trim().toLocaleLowerCase("az");
    const statusGroup = ["pending", "draft"].includes(expense.status) ? "pending" : expense.status === "rejected" ? "cancelled" : expense.status;
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
    <div className="ui-card">
      <h3 className="ui-section-title">Xərclər ({book.expenses.length})</h3>
      {msg && <div className="ui-notice ui-notice-warning">{msg}</div>}
      <div className="ui-table-actions ui-spacer-bottom">
        <Button type="button"  onClick={() => setOpenCreate(value => !value)}>+ Yeni xərc</Button>
        <Button type="button" variant="secondary" onClick={() => setOpenCategories(value => !value)}>Kateqoriyalar</Button>
      </div>
      {openCategories && <div className="ui-form-surface">
        <form onSubmit={async event => { event.preventDefault(); setMsg(""); try { if (editingCategory) await book.updateExpenseCategory(editingCategory, categoryName); else await book.createExpenseCategory(categoryName); setCategoryName(""); setEditingCategory(null); } catch (error) { setMsg(`Xəta: ${error.message}`); } }} className="ui-table-actions ui-spacer-bottom">
          <Input required value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="Kateqoriya adı"  />
          <Button type="submit" >{editingCategory ? "Yadda saxla" : "+ Kateqoriya"}</Button>
          {editingCategory && <Button type="button" variant="danger" onClick={() => { setEditingCategory(null); setCategoryName(""); }}>Ləğv et</Button>}
        </form>
        <div className="ui-table-actions ui-spacer-bottom">{book.expenseCategories.map(category => <div key={category.id} className="ui-category-item"><span>{category.name}</span><Button type="button" variant="ghost" onClick={() => { setEditingCategory(category); setCategoryName(category.name); }}>Düzəlt</Button><Button type="button" variant="danger" onClick={async () => { if (!(await appConfirm(`${category.name} kateqoriyası silinsin?`, { danger: true }))) return; try { await book.removeExpenseCategory(category); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Sil</Button></div>)}</div>
      </div>}
      {openCreate && <form onSubmit={submit} className="ui-form-grid ui-form-surface">
        <Select required value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} >
          <option value="">Kassa seçin</option>
          {book.accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {cashAmount(book.balanceOf(account.id), account.currency)}</option>)}
        </Select>
        <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} >
          {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input required placeholder="Təsvir" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}  />
        <Input required type="number" step="0.01" placeholder="Məbləğ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}  />
        <Input type="number" step="0.01" placeholder="ƏDV" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })}  />
        <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })}  />
        <Button type="submit" >+ Xərc</Button>
      </form>}
      {editing && <form onSubmit={async event => {
        event.preventDefault(); setMsg("");
        try { await book.updateExpense(editing.original, editing.values); setEditing(null); setMsg("Xərc və kassa əməliyyatı yeniləndi."); }
        catch (error) { setMsg(`Xəta: ${error.message}`); }
      }} className="ui-form-grid ui-form-surface">
        <Select required value={editing.values.account_id || ""} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, account_id: event.target.value } }))} ><option value="">Kassa seçin</option>{book.accounts.map(account => <option key={account.id} value={account.id}>{account.name} — {cashAmount(book.balanceOf(account.id), account.currency)}</option>)}</Select>
        <Select value={editing.values.category} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, category: event.target.value } }))} >{categoryNames.map(category => <option key={category}>{category}</option>)}</Select>
        <Input required value={editing.values.description || ""} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, description: event.target.value } }))}  placeholder="Təsvir" />
        <Input required type="number" min="0.01" step="0.01" value={editing.values.amount} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, amount: event.target.value } }))}  placeholder="Məbləğ" />
        <Input type="number" step="0.01" value={editing.values.vat_amount || ""} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, vat_amount: event.target.value } }))}  placeholder="ƏDV" />
        <Input type="date" value={editing.values.expense_date} onChange={event => setEditing(current => ({ ...current, values: { ...current.values, expense_date: event.target.value } }))}  />
        <Button type="submit" >Dəyişiklikləri saxla</Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Bağla</Button>
      </form>}
      <div className="ui-form-grid ui-form-surface">
        <Input value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Axtar…"  />
        <Select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value })} ><option value="">Bütün kateqoriyalar</option>{categoryNames.map(category => <option key={category}>{category}</option>)}</Select>
        <Select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} ><option value="">Bütün statuslar</option><option value="pending">Təsdiq gözləyir</option><option value="approved">Təsdiqləndi</option><option value="paid">Qəbul edildi</option><option value="refund_pending">Geri qaytarma gözləyir</option><option value="cancelled">Ləğv edildi</option></Select>
        <label className="ui-field"><span>Başlanğıc tarixi</span><Input type="date" value={filters.dateFrom} onChange={event => setFilters({ ...filters, dateFrom: event.target.value })}  /></label>
        <label className="ui-field"><span>Bitmə tarixi</span><Input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={event => setFilters({ ...filters, dateTo: event.target.value })}  /></label>
        <Button type="button" variant="secondary" onClick={() => setFilters({ search: "", category: "", status: "", dateFrom: "", dateTo: "" })}>Təmizlə</Button>
      </div>
      <DataTable label="Xərclər" rows={visibleExpenses} emptyText="Filterə uyğun xərc yoxdur."
        columns={[
          { key: 'date', label: 'Tarix', nowrap: true }, { key: 'category', label: 'Kateqoriya' },
          { key: 'description', label: 'Təsvir', sticky: true }, { key: 'amount', label: 'Məbləğ', align: 'right' },
          { key: 'status', label: 'Status' }, { key: 'approved', label: 'Təsdiq' },
          { key: 'accepted', label: 'Qəbul' }, { key: 'cancelled', label: 'Ləğv' },
          { key: 'impact', label: 'Kassa təsiri', align: 'right' }, { key: 'actions', label: 'Əməl.', minWidth: 200 },
        ]}
        renderCell={(e, column) => {
            const isPending = ["pending", "draft"].includes(e.status);
            const isCancelled = ["cancelled", "rejected"].includes(e.status);
            const isAccepted = e.status === "paid";
            const isApproved = isAccepted || e.status === "approved";
            const cashImpact = isCancelled ? 0 : -Number(e.amount || 0);
            const currency = e.account?.currency || book.accounts.find(account => account.id === e.account_id)?.currency || 'AZN';
            switch (column.key) {
              case 'date': return new Date(e.expense_date).toLocaleDateString("az-AZ");
              case 'category': return e.category;
              case 'description': return e.description || "—";
              case 'amount': return <b className="money-value">{cashAmount(e.amount, currency)}</b>;
              case 'status': return <span className={`ui-badge ui-badge-${isCancelled ? "danger" : isApproved ? "success" : e.status === "refund_pending" ? "danger" : "warning"}`}>{isAccepted ? "Qəbul edildi" : e.status === "approved" ? "Təsdiqləndi" : isCancelled ? "Ləğv edildi" : e.status === "refund_pending" ? "Geri qaytarma gözləyir" : "Təsdiq gözləyir"}</span>;
              case 'approved': return isApproved ? "Bəli" : "—";
              case 'accepted': return isAccepted ? "Bəli" : "—";
              case 'cancelled': return isCancelled ? "Bəli" : "—";
              case 'impact': return <span className={cashImpact ? 'amount-due money-value' : 'muted'}>{cashImpact ? cashAmount(cashImpact, currency) : "Kassaya qaytarılıb"}</span>;
              case 'actions': return <div className="ui-table-actions ui-spacer-bottom">
                {isPending && <>
                  <Button variant="secondary" onClick={() => setEditing({ original: e, values: { account_id: e.account_id || "", category: e.category, description: e.description || "", amount: e.amount, vat_amount: e.vat_amount || "", expense_date: e.expense_date } })}>Redaktə et</Button>
                  {!canApprove && <Button variant="danger" onClick={async () => { if (!(await appConfirm("Xərc ləğv edilsin və məbləğ kassaya qaytarılsın?", { danger: true }))) return; setMsg(""); try { await book.removeExpense(e); if (editing?.original?.id === e.id) setEditing(null); setMsg("Xərc ləğv edildi və məbləğ kassaya qaytarıldı."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Ləğv et</Button>}
                </>}
                {canApprove && isPending && <Button  onClick={async () => { setMsg(""); try { await book.approveExpense(e); setMsg("Xərc təsdiqləndi."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Təsdiqlə</Button>}
                {canApprove && !isAccepted && !isCancelled && <Button  onClick={async () => { setMsg(""); try { await book.acceptExpense(e); setMsg("Xərc qəbul edildi."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Qəbul et</Button>}
                {canApprove && !isCancelled && <Button variant="danger" onClick={async () => { if (!(await appConfirm("Xərc ləğv edilsin və məbləğ kassaya qaytarılsın?", { danger: true }))) return; setMsg(""); try { const res = await book.cancelExpense(e); setMsg(res?.reversed ? "Xərc ləğv edildi, məbləğ kassaya qaytarıldı." : "Xərc ləğv edildi."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Ləğv et</Button>}
                {canApprove && e.status === "refund_pending" && <Button  onClick={async () => { setMsg(""); try { await book.approveExpenseRefund(e); setMsg("Ləğv edilmiş məbləğ kassaya qaytarıldı."); } catch (error) { setMsg(`Xəta: ${error.message}`); } }}>Məbləği kassaya qaytar</Button>}
                </div>;
              default: return null;
            }
        }} />
    </div>
  );
}
