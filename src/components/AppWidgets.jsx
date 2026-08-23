import { lazy, useMemo, useRef, useState } from "react";
import { resolveModalKind } from "../config/modal-registry.js";
import {
  Check, Download, FileText, GitBranch, MessageSquare, Plus, Send, Trash2, Upload, Users, X,
} from "lucide-react";
import { initialState, stages } from "../data.js";
import { AvatarLine, DataTable, EmptyState, MetricCard, Panel, StatusBadge, TwoLine } from "./ui.jsx";
import { money, normalize } from "../services/format.js";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import { total } from "../shared/utils/aggregate.js";
import {
  currentBusinessDate, getEmployeeKey, hrLevelOptions, isPurchaseOrderOpen, getVendorKey,
} from "../shared/lib/appDomain.jsx";
import { addDays, creditTermOptions, getCreditSourceLabel } from "../shared/lib/credit.js";
import { normalizeMessageThread, nextContractNumber } from "../shared/lib/appHelpers.jsx";

const ExpenseOperationModal = lazy(() => import("./modals/OperationModals.jsx").then((module) => ({ default: module.ExpenseOperationModal })));
const OperationDeleteModal = lazy(() => import("./modals/OperationModals.jsx").then((module) => ({ default: module.OperationDeleteModal })));
const ProductFormModal = lazy(() => import("../modules/warehouse/components/WarehouseProductModals.jsx").then((module) => ({ default: module.ProductFormModal })));
const WarehouseFormModal = lazy(() => import("../modules/warehouse/components/WarehouseProductModals.jsx").then((module) => ({ default: module.WarehouseFormModal })));
const HrDepartmentModal = lazy(() => import("../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrDepartmentModal })));
const HrEmployeeDeleteModal = lazy(() => import("../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrEmployeeDeleteModal })));
const HrEmployeeModal = lazy(() => import("../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrEmployeeModal })));
const HrLeaveRequestModal = lazy(() => import("../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrLeaveRequestModal })));
const HrVacancyModal = lazy(() => import("../modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrVacancyModal })));
const FinanceAccountModal = lazy(() => import("../modules/finance/components/FinanceAccountModal.jsx").then((module) => ({ default: module.FinanceAccountModal })));
const StockIntakeModal = lazy(() => import("../modules/warehouse/components/StockIntakeModal.jsx").then((module) => ({ default: module.StockIntakeModal })));
const FactoryPurchaseOrderModal = lazy(() => import("../modules/procurement/components/ProcurementModals.jsx").then((module) => ({ default: module.FactoryPurchaseOrderModal })));
const VendorFormModal = lazy(() => import("../modules/procurement/components/ProcurementModals.jsx").then((module) => ({ default: module.VendorFormModal })));
const SalesOperationModal = lazy(() => import("../modules/sales/components/SalesOrderModals.jsx").then((module) => ({ default: module.SalesOperationModal })));
const SalesOrderModal = lazy(() => import("../modules/sales/components/SalesOrderModals.jsx").then((module) => ({ default: module.SalesOrderModal })));

const warehouseImportHeaderAliases = {
  product: ["məhsul", "məhsul adı", "product", "name"],
  sku: ["sku", "kod", "code"],
  warehouse: ["anbar", "warehouse"],
  qty: ["miqdar", "qalıq", "qty", "quantity"],
  salePrice: ["satış qiyməti", "satış", "sale price", "sale_price", "price"],
  costPrice: ["alış qiyməti", "maya", "cost price", "cost_price"],
  category: ["kateqoriya", "category"],
  reorderLevel: ["minimum stok", "minimum", "reorder level", "reorder_level"],
  unit: ["ölçü vahidi", "vahid", "unit"],
  serialTracked: ["serial izləmə", "serial", "imei", "serial tracked"],
};

function parseDelimitedCsv(text) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = cleanText.split("\n").find((line) => line.trim()) || "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const character = cleanText[index];
    if (character === '"') {
      if (quoted && cleanText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && character === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function parseWarehouseImportNumber(value) {
  const raw = String(value ?? "").trim().replace(/[₼\s]/g, "");
  if (!raw) return null;
  const commaIndex = raw.lastIndexOf(",");
  const dotIndex = raw.lastIndexOf(".");
  const normalizedValue = commaIndex > dotIndex
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : null;
}

function parseWarehouseImportBoolean(value) {
  const normalizedValue = normalize(value)
    .replaceAll("ə", "e")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]/g, "");
  if (["beli", "yes", "true", "1"].includes(normalizedValue)) return true;
  if (["xeyr", "no", "false", "0"].includes(normalizedValue)) return false;
  return null;
}

function getWarehouseImportCell(record, aliases) {
  for (const alias of aliases) {
    const value = record[normalize(alias)];
    if (value !== undefined) return value;
  }
  return "";
}

function parseWarehouseImportCsv(text, warehouses = []) {
  const csvRows = parseDelimitedCsv(text);
  if (csvRows.length === 0) return { rows: [], errors: ["CSV faylı boşdur."] };

  const header = csvRows[0].map((value) => normalize(value));
  const hasProduct = warehouseImportHeaderAliases.product.some((alias) => header.includes(normalize(alias)));
  const hasWarehouse = warehouseImportHeaderAliases.warehouse.some((alias) => header.includes(normalize(alias)));
  const hasQuantity = warehouseImportHeaderAliases.qty.some((alias) => header.includes(normalize(alias)));
  if (!hasProduct || !hasWarehouse || !hasQuantity) {
    return { rows: [], errors: ["CSV başlığında Məhsul, Anbar və Miqdar sütunları olmalıdır."] };
  }

  const warehouseByName = new Map(warehouses.flatMap((warehouse) => [
    [normalize(warehouse.name), warehouse],
    [normalize(warehouse.code), warehouse],
  ]));
  const rows = [];
  const errors = [];

  csvRows.slice(1).forEach((cells, index) => {
    const record = Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex] || ""]));
    const product = String(getWarehouseImportCell(record, warehouseImportHeaderAliases.product)).trim();
    const warehouseInput = String(getWarehouseImportCell(record, warehouseImportHeaderAliases.warehouse)).trim();
    const quantity = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.qty));
    const salePrice = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.salePrice));
    const costPrice = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.costPrice));
    const reorderLevel = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.reorderLevel));
    const warehouse = warehouseByName.get(normalize(warehouseInput));
    const lineNumber = index + 2;

    if (!product) {
      errors.push(`Sətir ${lineNumber}: məhsul adı boşdur.`);
      return;
    }
    if (!warehouse) {
      errors.push(`Sətir ${lineNumber}: anbar tapılmadı (${warehouseInput || "boş"}).`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      errors.push(`Sətir ${lineNumber}: miqdar müsbət tam ədəd olmalıdır.`);
      return;
    }
    if ([salePrice, costPrice, reorderLevel].some((value) => value !== null && value < 0)) {
      errors.push(`Sətir ${lineNumber}: qiymət və minimum stok mənfi ola bilməz.`);
      return;
    }

    rows.push({
      product,
      sku: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.sku)).trim().toUpperCase(),
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      qty: quantity,
      salePrice,
      costPrice,
      category: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.category)).trim(),
      reorderLevel: reorderLevel === null ? null : Math.max(0, Math.round(reorderLevel)),
      unit: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.unit)).trim(),
      serialTracked: parseWarehouseImportBoolean(getWarehouseImportCell(record, warehouseImportHeaderAliases.serialTracked)),
      lineNumber,
    });
  });

  return { rows, errors };
}

function downloadWarehouseImportTemplate() {
  const headers = ["Məhsul", "SKU", "Anbar", "Miqdar", "Satış qiyməti", "Alış qiyməti", "Kateqoriya", "Minimum stok", "Ölçü vahidi", "Serial izləmə"];
  const blob = new Blob([`\uFEFF${headers.join(";")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "anbar-toplu-import-sablonu.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function ContractPrintModal({ contract, settings = {}, onClose }) {
  function downloadDocument() {
    const content = `<!doctype html><html><head><meta charset="utf-8"><title>${contract.id}</title></head><body><h1>${settings.company || "ERP+CRM AZ"}</h1><h2>Satış müqaviləsi ${contract.id}</h2><p><strong>Müştəri:</strong> ${contract.customer}</p><p><strong>FİN:</strong> ${contract.fin || "—"}</p><p><strong>Məhsul:</strong> ${contract.product}</p><p><strong>Məbləğ:</strong> ${money(contract.amount)}</p><p><strong>Status:</strong> ${contract.status}</p><p>Bu sənəd ERP+CRM AZ sistemində formalaşdırılmışdır.</p></body></html>`;
    const blob = new Blob([content], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${contract.id}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-shell print-modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card invoice-print-card">
        <div className="modal-head no-print">
          <div>
            <h2>Müqavilə sənədi</h2>
            <p>PDF üçün çap dialoqundan “Save as PDF” seçin və ya Word sənədini endirin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <article className="invoice-paper">
          <div className="invoice-paper-head">
            <div>
              <strong>{settings.company || "ERP+CRM AZ"}</strong>
              <span>{settings.voen ? `VÖEN: ${settings.voen}` : ""}</span>
            </div>
            <div><strong>MÜQAVİLƏ</strong><span>{contract.id}</span></div>
          </div>
          <div className="invoice-meta-grid">
            <TwoLine title="Müştəri" subtitle={contract.customer} />
            <TwoLine title="FİN" subtitle={contract.fin || "—"} />
            <TwoLine title="Məhsul" subtitle={contract.product} />
            <TwoLine title="Məbləğ" subtitle={money(contract.amount)} />
          </div>
          <p className="contract-body-copy">Tərəflər məhsulun təhvil verilməsi, ödəniş və zəmanət şərtlərinin bu müqavilə üzrə tətbiq olunduğunu təsdiq edir.</p>
          <div className="contract-signatures"><span>Satıcı imzası</span><span>Müştəri imzası</span></div>
        </article>
        <div className="modal-actions no-print">
          <button className="secondary-btn" onClick={downloadDocument}><Download size={16} /> Word sənədi</button>
          <button className="primary-btn" onClick={() => window.print()}><FileText size={16} /> Print / PDF</button>
        </div>
      </div>
    </div>
  );
}

function CreditListRow({ item, active, onSelect }) {
  const { credit, plan, paymentState } = item;
  const statusText = paymentState.isOverdue
    ? `${paymentState.daysOverdue} gün gecikib`
    : paymentState.isDueToday
      ? "Bu gün"
      : credit.status;
  const sourceLabel = getCreditSourceLabel(credit);

  return (
    <button
      className={`credit-list-row ${active ? "active" : ""} ${paymentState.isOverdue ? "overdue" : ""}`}
      onClick={onSelect}
    >
      <div className="credit-list-main">
        <strong>{credit.customer}</strong>
        <span>
          {credit.id} · {credit.contractId || "Müqaviləsiz"}
        </span>
      </div>
      <div className="credit-list-meta">
        <span>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</span>
        <strong>{money(paymentState.nextInstallment?.amount || plan.monthly)}</strong>
      </div>
      <div className="credit-list-extra">
        <span>{sourceLabel}</span>
        <strong>{money(plan.balance)} qalıq</strong>
      </div>
      <StatusBadge status={statusText} />
    </button>
  );
}

function MessagesPageV2({
  conversations,
  conversationId,
  setConversationId,
  draftMessage,
  setDraftMessage,
  sendMessage,
  canSend = true,
  canManage = true,
  currentUser,
  participants = [],
  contextOptions = [],
  onCreateConversation,
  onArchiveConversation,
  onDeleteConversation,
  onOpenSalesOrder,
  onOpenCredit,
  onOpenSupportTicket,
  onOpenCustomer,
}) {
  const [filter, setFilter] = useState("active");
  const [composerOpen, setComposerOpen] = useState(false);
  const [newThread, setNewThread] = useState({
    type: "direct",
    title: "",
    team: "",
    participantIds: [],
    contextKey: "",
    firstMessage: "",
  });
  const normalizedConversations = (conversations || []).map(normalizeMessageThread);
  const counts = {
    all: normalizedConversations.length,
    active: normalizedConversations.filter((item) => !item.archived).length,
    unread: normalizedConversations.filter((item) => Number(item.unread || 0) > 0).length,
    groups: normalizedConversations.filter((item) => item.type === "group").length,
    linked: normalizedConversations.filter((item) => item.ticketId || item.orderId || item.creditId || item.customerFin).length,
    archived: normalizedConversations.filter((item) => item.archived).length,
  };
  const filters = [
    { id: "active", label: "Aktiv", count: counts.active },
    { id: "unread", label: "Oxunmamış", count: counts.unread },
    { id: "groups", label: "Qruplar", count: counts.groups },
    { id: "linked", label: "Bağlı", count: counts.linked },
    { id: "archived", label: "Arxiv", count: counts.archived },
    { id: "all", label: "Hamısı", count: counts.all },
  ];
  const visibleConversations = normalizedConversations.filter((conversation) => {
    if (filter === "all") return true;
    if (filter === "active") return !conversation.archived;
    if (filter === "unread") return Number(conversation.unread || 0) > 0;
    if (filter === "groups") return conversation.type === "group";
    if (filter === "linked") return conversation.ticketId || conversation.orderId || conversation.creditId || conversation.customerFin;
    if (filter === "archived") return conversation.archived;
    return true;
  });
  const selected =
    normalizedConversations.find((item) => item.id === conversationId) ||
    visibleConversations[0] ||
    normalizedConversations[0];
  const selectedMessages = selected?.messages || [];
  const selectedContext = contextOptions.find((item) => item.type && `${item.type}::${item.id}` === newThread.contextKey);
  const selectedParticipantNames = participants
    .filter((participant) => newThread.participantIds.includes(participant.id))
    .map((participant) => participant.name);
  const canSubmitNewThread =
    canManage &&
    (newThread.type === "group" ? newThread.title.trim() && newThread.participantIds.length > 0 : newThread.participantIds.length > 0 || newThread.contextKey);

  function toggleParticipant(id) {
    setNewThread((current) => ({
      ...current,
      participantIds: current.participantIds.includes(id)
        ? current.participantIds.filter((item) => item !== id)
        : [...current.participantIds, id],
    }));
  }

  function createThread() {
    if (!canSubmitNewThread) return;
    onCreateConversation?.({
      type: newThread.type,
      title: newThread.title,
      team: newThread.team,
      participantIds: newThread.participantIds,
      linkedType: selectedContext?.type || "",
      linkedId: selectedContext?.id || "",
      firstMessage: newThread.firstMessage,
    });
    setNewThread({
      type: "direct",
      title: "",
      team: "",
      participantIds: [],
      contextKey: "",
      firstMessage: "",
    });
    setComposerOpen(false);
  }

  return (
    <section className="messages-workspace">
      <div className="messages-summary-grid">
        <MetricCard label="Aktiv söhbət" value={counts.active} trend={`${counts.unread} oxunmamış`} icon={MessageSquare} tone="primary" />
        <MetricCard label="Qrup" value={counts.groups} trend="Daxili komanda kanalları" icon={Users} tone="success" />
        <MetricCard label="Bağlı thread" value={counts.linked} trend="Sifariş/kredit/task" icon={GitBranch} tone="info" />
        <MetricCard label="Arxiv" value={counts.archived} trend="Bağlanmış yazışmalar" icon={FileText} tone="warning" />
      </div>

      <section className="messages-layout">
        <Panel className="message-list-panel">
          <div className="message-list-head">
            <div>
              <h3>Inbox</h3>
              <p>{currentUser?.name || "İstifadəçi"} üçün daxili yazışmalar</p>
            </div>
            <button className="primary-btn compact" onClick={() => setComposerOpen((value) => !value)} disabled={!canManage}>
              <Plus size={16} />
              Yeni
            </button>
          </div>

          <div className="message-filter-tabs">
            {filters.map((item) => (
              <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>

          {composerOpen && (
            <div className="message-thread-form">
              <div className="segmented-control">
                {[
                  ["direct", "Şəxsi"],
                  ["group", "Qrup"],
                ].map(([id, label]) => (
                  <button key={id} className={newThread.type === id ? "active" : ""} onClick={() => setNewThread((current) => ({ ...current, type: id }))}>
                    {label}
                  </button>
                ))}
              </div>

              <label className="message-field">
                <span>{newThread.type === "group" ? "Qrup adı" : "Başlıq"}</span>
                <input
                  value={newThread.title}
                  onChange={(event) => setNewThread((current) => ({ ...current, title: event.target.value }))}
                  placeholder={newThread.type === "group" ? "Məs: Satış komandası" : "Boş qala bilər"}
                />
              </label>

              <label className="message-field">
                <span>Şöbə / kanal</span>
                <input
                  value={newThread.team}
                  onChange={(event) => setNewThread((current) => ({ ...current, team: event.target.value }))}
                  placeholder="Satış, Anbar, Maliyyə..."
                />
              </label>

              <label className="message-field">
                <span>Bağlantı</span>
                <select
                  value={newThread.contextKey}
                  onChange={(event) => setNewThread((current) => ({ ...current, contextKey: event.target.value }))}
                >
                  {contextOptions.map((item) => (
                    <option key={`${item.type}::${item.id}`} value={item.type ? `${item.type}::${item.id}` : ""}>
                      {item.type ? `${item.label} - ${item.detail}` : item.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="message-participant-picker">
                <span>İştirakçılar</span>
                <div>
                  {participants.slice(0, 12).map((participant) => (
                    <button
                      key={participant.id}
                      type="button"
                      className={newThread.participantIds.includes(participant.id) ? "selected" : ""}
                      onClick={() => toggleParticipant(participant.id)}
                    >
                      {participant.name}
                      <small>{participant.team}</small>
                    </button>
                  ))}
                </div>
                {selectedParticipantNames.length === 0 && <small>Ən azı bir iştirakçı seçin.</small>}
              </div>

              <label className="message-field">
                <span>İlk mesaj</span>
                <textarea
                  value={newThread.firstMessage}
                  onChange={(event) => setNewThread((current) => ({ ...current, firstMessage: event.target.value }))}
                  placeholder="İstəyə bağlı başlanğıc mesajı..."
                />
              </label>

              <div className="message-form-actions">
                <button className="secondary-btn compact" onClick={() => setComposerOpen(false)}>
                  <X size={15} />
                  Bağla
                </button>
                <button className="primary-btn compact" onClick={createThread} disabled={!canSubmitNewThread}>
                  <Plus size={15} />
                  Yarat
                </button>
              </div>
            </div>
          )}

          <div className="conversation-list">
            {visibleConversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-row ${conversation.id === selected?.id ? "active" : ""}`}
                onClick={() => setConversationId(conversation.id)}
              >
                <AvatarLine
                  initials={conversation.initials}
                  title={conversation.title || conversation.person}
                  subtitle={conversation.preview}
                />
                <div className="conversation-meta">
                  <span>{conversation.time}</span>
                  <small>{conversation.type === "group" ? "Qrup" : conversation.ticketId ? "Task" : "Şəxsi"}</small>
                  {conversation.unread > 0 && <strong>{conversation.unread}</strong>}
                </div>
              </button>
            ))}
            {visibleConversations.length === 0 && <EmptyState title="Bu filter üzrə söhbət yoxdur" />}
          </div>
        </Panel>

        <Panel className="chat-panel">
          {selected ? (
            <>
              <div className="chat-head">
                <div className="chat-head-main">
                  <AvatarLine
                    initials={selected.initials}
                    title={selected.title || selected.person}
                    subtitle={`${selected.team} · ${selected.participants.length || 1} iştirakçı`}
                  />
                  <div className="chat-head-actions">
                    <StatusBadge status={selected.archived ? "Arxiv" : selected.type === "group" ? "Qrup" : "Aktiv"} />
                    <button className="secondary-btn compact" onClick={() => onArchiveConversation?.(selected.id)} disabled={!canManage}>
                      {selected.archived ? "Aktiv et" : "Arxivlə"}
                    </button>
                    <button
                      className="secondary-btn compact danger-soft"
                      onClick={() => {
                        if (window.confirm("Bu söhbət silinsin?")) onDeleteConversation?.(selected.id);
                      }}
                      disabled={!canManage}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {(selected.ticketId || selected.orderId || selected.creditId || selected.customerFin) && (
                  <div className="message-context-strip">
                    {selected.ticketId && (
                      <button className="secondary-btn compact" onClick={() => onOpenSupportTicket(selected.ticketId)}>
                        Task {selected.ticketId}
                      </button>
                    )}
                    {selected.orderId && (
                      <button className="secondary-btn compact" onClick={() => onOpenSalesOrder(selected.orderId)}>
                        Sifariş {selected.orderId}
                      </button>
                    )}
                    {selected.creditId && (
                      <button className="secondary-btn compact" onClick={() => onOpenCredit(selected.creditId)}>
                        Kredit {selected.creditId}
                      </button>
                    )}
                    {selected.customerFin && (
                      <button className="secondary-btn compact" onClick={() => onOpenCustomer?.(selected.customerFin)}>
                        Müştəri {selected.customerFin}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="chat-body">
                {selectedMessages.map((message, index) => (
                  <div key={message.id || `${message.time}-${index}`} className={`bubble ${message.mine ? "mine" : ""}`}>
                    <div className="bubble-author">{message.from || "İstifadəçi"}</div>
                    <p>{message.text}</p>
                    <span>{message.time} · {message.status || (message.readAt ? "Oxundu" : "Göndərildi")}</span>
                  </div>
                ))}
                {selectedMessages.length === 0 && <EmptyState title="Bu söhbətdə hələ mesaj yoxdur" />}
              </div>

              <div className="composer">
                <textarea
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && canSend) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Mesaj yazın..."
                  disabled={!canSend || selected.archived}
                  title={!canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
                />
                <button
                  className="primary-btn icon-only"
                  onClick={sendMessage}
                  aria-label="Mesaj göndər"
                  disabled={!canSend || selected.archived}
                  title={selected.archived ? "Arxiv söhbətə mesaj yazmaq üçün əvvəl aktiv edin" : !canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
                >
                  <Send size={17} />
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Mesaj tapılmadı" />
          )}
        </Panel>
      </section>
    </section>
  );
}

function TaskItem({ tone, title, value, label }) {
  return (
    <div className={`task-item ${tone}`}>
      <div>
        <strong>{title}</strong>
        <span>{label}</span>
      </div>
      <b>{value}</b>
    </div>
  );
}

function WarehouseImportModal({ warehouses, onClose, onImport }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState({ rows: [], errors: [] });
  const [isReading, setIsReading] = useState(false);

  async function readFile(file) {
    if (!file) return;
    setIsReading(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      setAnalysis(parseWarehouseImportCsv(text, warehouses));
    } catch {
      setAnalysis({ rows: [], errors: ["CSV faylı oxunmadı."] });
    } finally {
      setIsReading(false);
    }
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card warehouse-import-card">
        <div className="modal-head">
          <div>
            <h2>Toplu stok importu</h2>
            <p>CSV faylından anbar qalıqlarını əlavə edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>

        <div className="warehouse-import-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV faylı seçin"
            onChange={(event) => readFile(event.target.files?.[0])}
          />
          <button type="button" className="primary-btn" disabled={isReading} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> {isReading ? "Oxunur..." : "CSV seçin"}
          </button>
          <button type="button" className="secondary-btn" onClick={downloadWarehouseImportTemplate}>
            <Download size={16} /> Şablon CSV
          </button>
          {fileName && <span>{fileName}</span>}
        </div>

        {(analysis.rows.length > 0 || analysis.errors.length > 0) && (
          <>
            <div className="warehouse-import-summary">
              <strong>{analysis.rows.length} etibarlı sətir</strong>
              <span>{analysis.errors.length} xəta</span>
            </div>
            {analysis.rows.length > 0 && (
              <DataTable
                columns={["Məhsul", "SKU", "Anbar", "Miqdar", "Satış", "Maya", "Minimum"]}
                rows={analysis.rows.slice(0, 8).map((row) => [
                  <strong>{row.product}</strong>,
                  row.sku || "Avtomatik",
                  row.warehouseName,
                  row.qty,
                  row.salePrice === null ? "—" : money(row.salePrice),
                  row.costPrice === null ? "—" : money(row.costPrice),
                  row.reorderLevel === null ? "—" : row.reorderLevel,
                ])}
              />
            )}
            {analysis.errors.length > 0 && (
              <div className="warehouse-import-errors">
                {analysis.errors.slice(0, 5).map((error) => <span key={error}>{error}</span>)}
                {analysis.errors.length > 5 && <span>və daha {analysis.errors.length - 5} xəta</span>}
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
          <button type="button" className="primary-btn" disabled={analysis.rows.length === 0 || isReading} onClick={() => onImport(analysis.rows)}>
            <Upload size={16} /> İmport et
          </button>
        </div>
      </div>
    </div>
  );
}


function CreateModal({
  type,
  mode,
  config,
  warehouse,
  product,
  employee,
  vendor,
  financeAccount,
  salesOrder,
  expense,
  contract,
  companySettings,
  orderOptions,
  salesDefaults,
  onClose,
  onCreate,
  onUpdateWarehouse,
  onReceiveStock,
  onCreatePurchaseOrder,
  onImportWarehouseStock,
  onUpdateProduct,
  onDeleteProduct,
  onSaveFinanceAccount,
  onUpdateSalesOrder,
  onDeleteSalesOrder,
  onUpdateExpense,
  onDeleteExpense,
  onSaveVendor,
  onRequestVendorDelete,
  onDeleteVendor,
  onSaveEmployee,
  onCreateDepartment,
  onDeleteEmployee,
  onCreateLeaveRequest,
  onCreateVacancy,
}) {
  const modalKind = resolveModalKind(type);

  if (modalKind === "warehouse") {
    return (
      <WarehouseFormModal
        mode={mode}
        warehouse={warehouse}
        onClose={onClose}
        onSubmit={(values) => {
          if (mode === "edit" && warehouse) {
            onUpdateWarehouse(warehouse.id, values);
            return;
          }
          onCreate("warehouse", values);
        }}
      />
    );
  }

  if (modalKind === "stockIntake") {
    return (
      <StockIntakeModal
        warehouses={orderOptions.warehouses}
        products={orderOptions.products}
        onClose={onClose}
        onSubmit={onReceiveStock}
      />
    );
  }

  if (modalKind === "warehouseImport") {
    return <WarehouseImportModal warehouses={orderOptions.warehouses} onClose={onClose} onImport={onImportWarehouseStock} />;
  }

  if (modalKind === "purchaseOrder") {
    return (
      <FactoryPurchaseOrderModal
        vendors={orderOptions.vendors}
        warehouses={orderOptions.warehouses}
        products={orderOptions.products}
        warehouseStock={orderOptions.warehouseStock}
        purchaseOrders={orderOptions.purchaseOrders}
        onClose={onClose}
        onSubmit={onCreatePurchaseOrder}
      />
    );
  }

  if (modalKind === "vendor") {
    return (
      <VendorFormModal
        vendor={vendor}
        onClose={onClose}
        onSubmit={(values) => {
          if (mode === "edit" && vendor) {
            onSaveVendor(getVendorKey(vendor), values);
            return;
          }
          onCreate("vendors", values);
        }}
        onDelete={vendor ? () => onRequestVendorDelete(getVendorKey(vendor)) : null}
      />
    );
  }

  if (modalKind === "vendorDelete" && vendor) {
    const openPoCount = (orderOptions.purchaseOrders || []).filter(
      (po) =>
        isPurchaseOrderOpen(po) &&
        (normalize(po.vendor) === normalize(vendor.name) || normalize(po.supplierSource) === normalize(vendor.name)),
    ).length;

    return (
      <OperationDeleteModal
        title="Vendoru sil"
        description={`${vendor.name} · ${vendor.country || "Ölkə qeyd edilməyib"}`}
        warning={
          openPoCount > 0
            ? `${openPoCount} açıq PO var. Əvvəl PO-ları təsdiqləyin, sonra vendor silinə bilər.`
            : "Vendor reyestrdən silinəcək. Bağlı təsdiqlənmiş PO tarixçəsi qalacaq."
        }
        confirmDisabled={openPoCount > 0}
        confirmLabel={openPoCount > 0 ? "PO açıqdır" : "Sil"}
        onClose={onClose}
        onConfirm={() => onDeleteVendor(getVendorKey(vendor))}
      />
    );
  }

  if (modalKind === "employee") {
    return (
      <HrEmployeeModal
        employee={employee}
        employees={orderOptions.employees}
        departments={orderOptions.departments}
        onClose={onClose}
        onSubmit={(values) => {
          if (employee) {
            onSaveEmployee(getEmployeeKey(employee), values);
            return;
          }
          onCreate("hr", values);
        }}
      />
    );
  }

  if (modalKind === "department") {
    return <HrDepartmentModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateDepartment} />;
  }

  if (modalKind === "leaveRequest") {
    return <HrLeaveRequestModal employees={orderOptions.employees} onClose={onClose} onSubmit={onCreateLeaveRequest} />;
  }

  if (modalKind === "vacancy") {
    return <HrVacancyModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateVacancy} />;
  }

  if (modalKind === "employeeDelete" && employee) {
    return <HrEmployeeDeleteModal employee={employee} employees={orderOptions.employees} onClose={onClose} onConfirm={(replacementManagerId) => onDeleteEmployee(getEmployeeKey(employee), replacementManagerId)} />;
  }

  if (modalKind === "product") {
    return (
      <ProductFormModal
        product={product}
        onClose={onClose}
        onDelete={mode === "edit" && product ? () => onDeleteProduct(product.id) : null}
        onSubmit={(values) => {
          if (mode === "edit" && product) {
            return onUpdateProduct(product.id, values);
          }
          return onCreate("product", values);
        }}
      />
    );
  }

  if (modalKind === "financeAccount") {
    return (
      <FinanceAccountModal
        account={financeAccount}
        onClose={onClose}
        onSubmit={(values) => onSaveFinanceAccount(financeAccount?.id, values)}
      />
    );
  }

  if (modalKind === "contractPrint" && contract) {
    return <ContractPrintModal contract={contract} settings={companySettings} onClose={onClose} />;
  }

  if (modalKind === "salesOperation" && salesOrder) {
    return (
      <SalesOperationModal
        order={salesOrder}
        orderOptions={orderOptions}
        onClose={onClose}
        onSubmit={(values) => onUpdateSalesOrder(salesOrder.id, values)}
      />
    );
  }

  if (modalKind === "salesOperationDelete" && salesOrder) {
    return (
      <OperationDeleteModal
        title="Satış əməliyyatını sil"
        description={`${salesOrder.id} · ${salesOrder.customer} · ${money(salesOrder.amount)}`}
        warning="Təhvil verilməyibsə rezerv açılacaq. Kreditli satışdırsa bağlı kredit, müqavilə və kassa daxilolmaları da təmizlənəcək."
        onClose={onClose}
        onConfirm={() => onDeleteSalesOrder(salesOrder.id)}
      />
    );
  }

  if (modalKind === "expenseOperation" && expense) {
    return (
      <ExpenseOperationModal
        expense={expense}
        onClose={onClose}
        onSubmit={(values) => onUpdateExpense(expense.id, values)}
      />
    );
  }

  if (modalKind === "expenseOperationDelete" && expense) {
    return (
      <OperationDeleteModal
        title="Xərc əməliyyatını sil"
        description={`${expense.id} · ${expense.description} · ${money(expense.amount)}`}
        warning="Bu xərc ledger, P&L və cash balans hesablamalarından çıxarılacaq."
        onClose={onClose}
        onConfirm={() => onDeleteExpense(expense.id)}
      />
    );
  }

  if (modalKind === "salesOrder") {
    return (
      <SalesOrderModal
        type={type}
        orderOptions={orderOptions}
        defaults={salesDefaults}
        onClose={onClose}
        onCreate={onCreate}
      />
    );
  }

  return (
    <GenericCreateModal
      type={type}
      config={config}
      onClose={onClose}
      onCreate={onCreate}
    />
  );
}

function GenericCreateModal({ type, config, onClose, onCreate }) {
  const [values, setValues] = useState(
    Object.fromEntries(config.fields.map((field) => [field.name, field.value || ""])),
  );

  function submit(event) {
    event.preventDefault();
    onCreate(type, values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{config.title}</h2>
            <p>{config.subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          {config.fields.map((field) => (
            <label key={field.name} className={field.full ? "full" : ""}>
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select
                  value={values[field.name]}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || "text"}
                  value={values[field.name]}
                  required={field.required}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                />
              )}
            </label>
          ))}
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="primary-btn">
              <Plus size={16} />
              Əlavə et
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.variant}`}>
          <Check size={16} />
          {toast.message}
        </div>
      ))}
    </div>
  );
}

const createConfig = {
  dashboard: {
    title: "Yeni sifariş",
    subtitle: "Sifariş satış, anbar və təhvil moduluna düşəcək.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "products", label: "Məhsul", required: true, full: true },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
      { name: "paid", label: "Daxil olan", type: "number", value: "0" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: stages,
      },
    ],
  },
  crm: {
    title: "Yeni müştəri",
    subtitle: "FİN kodu və kredit limiti ilə müştəri açılışı.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "fin", label: "FİN", required: true },
      { name: "phone", label: "Telefon", required: true },
      {
        name: "category",
        label: "Kateqoriya",
        type: "select",
        options: ["Gümüş", "Qızıl", "Platin"],
      },
      { name: "limit", label: "Kredit limiti", type: "number" },
      { name: "debt", label: "Cari borc", type: "number", value: "0" },
    ],
  },
  sales: {
    title: "Yeni sifariş",
    subtitle: "Satıcı bölgüsü və ödəniş məlumatı ilə sifariş yaradın.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "products", label: "Məhsul", required: true, full: true },
      { name: "seller", label: "Satıcı bölgüsü" },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
      { name: "paid", label: "Daxil olan", type: "number", value: "0" },
    ],
  },
  finance: {
    title: "Yeni xərc",
    subtitle: "Xərc avtomatik təsdiq gözləyir statusu ilə açılır.",
    fields: [
      { name: "description", label: "Təsvir", required: true },
      { name: "category", label: "Kateqoriya", required: true },
      { name: "date", label: "Tarix", type: "date", value: currentBusinessDate },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
    ],
  },
  credits: {
    title: "Yeni kredit",
    subtitle: "Aylıq ödəniş cədvəli avtomatik hesablanır.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "contractId", label: "Müqavilə №", value: nextContractNumber(initialState) },
      { name: "product", label: "Cihaz", required: true },
      { name: "total", label: "Ümumi məbləğ", type: "number", required: true },
      { name: "initialPayment", label: "İlkin ödəniş", type: "number", value: "0" },
      {
        name: "months",
        label: "Müddət",
        type: "select",
        value: "12",
        options: creditTermOptions.map((month) => `${month}`),
      },
      { name: "next", label: "Növbəti tarix", value: formatPaymentDate(addDays(parsePaymentDate(currentBusinessDate), 30)) },
    ],
  },
  vendors: {
    title: "Yeni vendor",
    subtitle: "Vendor kvota cədvəlinə əlavə olunacaq.",
    fields: [
      { name: "name", label: "Vendor adı", required: true },
      { name: "country", label: "Ölkə", required: true },
      { name: "sku", label: "SKU sayı", type: "number", required: true },
      { name: "quota", label: "Kvota", type: "number", required: true },
    ],
  },
  hr: {
    title: "Yeni əməkdaş",
    subtitle: "HR reyestrinə əməkdaş əlavə edin.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "position", label: "Vəzifə", required: true },
      { name: "department", label: "Şöbə", required: true },
      { name: "departmentParent", label: "Üst şöbə" },
      { name: "managerName", label: "Rəhbər adı" },
      {
        name: "level",
        label: "Səviyyə",
        type: "select",
        value: "Komanda üzvü",
        options: hrLevelOptions,
      },
      { name: "salary", label: "Maaş", type: "number", required: true },
      { name: "kpi", label: "KPI", type: "number", value: "85" },
      { name: "hireDate", label: "İşə qəbul tarixi", type: "date", value: currentBusinessDate },
      {
        name: "workMode",
        label: "İş rejimi",
        type: "select",
        value: "Ofis",
        options: ["Ofis", "Hybrid", "Sahə", "Uzaqdan"],
      },
      { name: "shift", label: "Növbə", value: "09:00-18:00" },
      {
        name: "employmentType",
        label: "Məşğulluq tipi",
        type: "select",
        value: "Tam ştat",
        options: ["Tam ştat", "Yarım ştat", "Müqaviləli", "Sınaq müddəti"],
      },
      { name: "leaveBalance", label: "Məzuniyyət balansı", type: "number", value: "0" },
      { name: "documentsComplete", label: "Sənədlər, %", type: "number", value: "100" },
      { name: "skills", label: "Bacarıqlar (vergüllə)", full: true },
    ],
  },
  contracts: {
    title: "Yeni müqavilə",
    subtitle: "Şablon əsasında müqavilə hazırlanacaq.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "product", label: "Məhsul", required: true },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
    ],
  },
};

export {
  parseDelimitedCsv,
  parseWarehouseImportNumber,
  parseWarehouseImportBoolean,
  getWarehouseImportCell,
  parseWarehouseImportCsv,
  downloadWarehouseImportTemplate,
  ContractPrintModal,
  CreditListRow,
  MessagesPageV2,
  TaskItem,
  WarehouseImportModal,
  CreateModal,
  GenericCreateModal,
  ToastStack,
  createConfig,
};
