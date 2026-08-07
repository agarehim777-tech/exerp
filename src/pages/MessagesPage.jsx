import { AvatarLine, EmptyState, Panel, StatusBadge } from "../components/ui.jsx";
import { Send } from "lucide-react";
export default function MessagesPage({
  conversations,
  conversationId,
  setConversationId,
  draftMessage,
  setDraftMessage,
  sendMessage,
  canSend = true,
  onOpenSalesOrder,
  onOpenCredit,
  onOpenSupportTicket,
}) {
  const selected = conversations.find((item) => item.id === conversationId) || conversations[0];
  return (
    <section className="messages-layout">
      <Panel className="message-list-panel">
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation-row ${conversation.id === selected?.id ? "active" : ""}`}
              onClick={() => setConversationId(conversation.id)}
            >
              <AvatarLine
                initials={conversation.initials}
                title={conversation.person}
                subtitle={conversation.preview}
              />
              <div className="conversation-meta">
                <span>{conversation.time}</span>
                {conversation.unread > 0 && <strong>{conversation.unread}</strong>}
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="chat-panel">
        {selected ? (
          <>
            <div className="chat-head">
              <AvatarLine initials={selected.initials} title={selected.person} subtitle={`${selected.team} şöbəsi · onlayn`} />
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
                  {selected.customerFin && <StatusBadge status={`Müştəri ${selected.customerFin}`} />}
                </div>
              )}
            </div>
            <div className="chat-body">
              {selected.messages.map((message, index) => (
                <div key={`${message.time}-${index}`} className={`bubble ${message.from === "Admin" || message.mine ? "mine" : ""}`}>
                  <p>{message.text}</p>
                  <span>{message.time}</span>
                </div>
              ))}
            </div>
            <div className="composer">
              <input
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSend) sendMessage();
                }}
                placeholder="Mesaj yazın..."
                disabled={!canSend}
                title={!canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
              />
              <button
                className="primary-btn icon-only"
                onClick={sendMessage}
                aria-label="Mesaj göndər"
                disabled={!canSend}
                title={!canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
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
  );
}