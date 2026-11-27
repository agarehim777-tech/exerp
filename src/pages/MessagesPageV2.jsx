import { useState } from "react";
import { FileText, GitBranch, MessageSquare, Plus, Send, Trash2, Users, X } from "lucide-react";
import { AvatarLine, EmptyState, MetricCard, Panel, StatusBadge } from "../shared/ui/primitives.tsx";
import { normalizeMessageThread } from "../shared/lib/appHelpers.jsx";
import { appConfirm } from "../shared/ui/dialogService.js";

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
  // Threads come from message_threads after the collection sync finishes; until then show loading, not "none".
  loading = false,
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
        <MetricCard label="Bağlı thread" value={counts.linked} trend="Sifariş/kredit/tapşırıq" icon={GitBranch} tone="info" />
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
                  <X size={16} />
                  Bağla
                </button>
                <button className="primary-btn compact" onClick={createThread} disabled={!canSubmitNewThread}>
                  <Plus size={16} />
                  Yarat
                </button>
              </div>
            </div>
          )}

          <div className="conversation-list">
            {visibleConversations.map((conversation) => (
              <button
                key={conversation.id}
                data-conversation-id={conversation.id}
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
                  <small>{conversation.type === "group" ? "Qrup" : conversation.ticketId ? "Tapşırıq" : "Şəxsi"}</small>
                  {conversation.unread > 0 && <strong>{conversation.unread}</strong>}
                </div>
              </button>
            ))}
            {visibleConversations.length === 0 && <EmptyState title={loading ? "Söhbətlər yüklənir…" : "Bu filtr üzrə söhbət yoxdur"} />}
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
                      onClick={async () => {
                        if (await appConfirm("Bu söhbət silinsin?", { danger: true })) onDeleteConversation?.(selected.id);
                      }}
                      disabled={!canManage}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {(selected.ticketId || selected.orderId || selected.creditId || selected.customerFin) && (
                  <div className="message-context-strip">
                    {selected.ticketId && (
                      <button className="secondary-btn compact" onClick={() => onOpenSupportTicket(selected.ticketId)}>
                        Tapşırıq {selected.ticketId}
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
                  <Send size={16} />
                </button>
              </div>
            </>
          ) : (
            <EmptyState title={loading ? "Söhbətlər yüklənir…" : "Mesaj tapılmadı"} />
          )}
        </Panel>
      </section>
    </section>
  );
}

export { MessagesPageV2 };
