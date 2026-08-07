import { CalendarClock, CircleAlert, MessageSquare, Send, ShieldCheck } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { useMemo, useState } from "react";
import { buildSupportTicketContext } from "../shared/lib/appDomain.jsx";
export default function SupportPage({
  tickets,
  orders = [],
  credits = [],
  customers = [],
  conversations = [],
  selectedTicketId,
  onSelectTicket,
  onAddComment,
  onUpdateStatus,
  onOpenConversation,
  onOpenSalesOrder,
  onOpenCredit,
  onOpenCustomer,
}) {
  const [commentDraft, setCommentDraft] = useState("");
  const enrichedTickets = useMemo(
    () => tickets.map((ticket) => buildSupportTicketContext(ticket, { orders, credits, customers, conversations })),
    [tickets, orders, credits, customers, conversations],
  );
  const selected = enrichedTickets.find((ticket) => ticket.id === selectedTicketId) || enrichedTickets[0];
  const openTickets = enrichedTickets.filter((ticket) => ticket.status !== "Bağlandı");
  const highPriority = enrichedTickets.filter((ticket) => ticket.priority === "Yüksək");
  const linkedTickets = enrichedTickets.filter((ticket) => ticket.linkedId || ticket.orderId || ticket.creditId || ticket.fin);
  const avgSla = enrichedTickets.length
    ? Math.round(enrichedTickets.reduce((sum, ticket) => sum + Number(ticket.slaHours || 0), 0) / enrichedTickets.length)
    : 0;

  function submitComment() {
    if (!selected || !commentDraft.trim()) return;
    onAddComment(selected.id, commentDraft);
    setCommentDraft("");
  }

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Açıq sorğu" value={openTickets.length} icon={MessageSquare} tone="primary" />
        <MetricCard label="Yüksək prioritet" value={highPriority.length} icon={CircleAlert} tone={highPriority.length ? "warning" : "success"} />
        <MetricCard label="Orta SLA" value={`${avgSla} saat`} icon={CalendarClock} tone="info" />
        <MetricCard label="Bağlı task" value={linkedTickets.length} trend={`${new Set(enrichedTickets.map((ticket) => ticket.module)).size} modul`} icon={ShieldCheck} tone="success" />
      </section>
      <section className="support-workspace">
        <Panel className="support-panel support-queue-panel" data-testid="support-task-panel">
          <PanelHeader title="Support və task növbəsi" subtitle="Sifariş, kredit və müştəriyə bağlı operativ tapşırıqlar" icon={MessageSquare} />
          <DataTable
            columns={["Sorğu", "Bağlantı", "Prioritet", "Comment", "Məsul", "SLA", "Status", "Aç"]}
            rows={enrichedTickets.map((ticket) => [
              <TwoLine title={ticket.title} subtitle={`${ticket.id} · ${ticket.createdAt}`} />,
              <TwoLine title={ticket.linkedLabel} subtitle={ticket.customer || ticket.fin || ticket.module} />,
              <StatusBadge status={ticket.priority} />,
              ticket.commentCount,
              ticket.owner,
              `${ticket.slaHours} saat`,
              <StatusBadge status={ticket.status} />,
              <button className="text-btn" onClick={() => onSelectTicket(ticket.id)}>
                Bax
              </button>,
            ])}
          />
        </Panel>
        <Panel className="support-detail-panel">
          {selected ? (
            <>
              <div className="support-detail-head">
                <div>
                  <StatusBadge status={selected.priority} />
                  <h3>{selected.title}</h3>
                  <p>{selected.id} · {selected.requester} · {selected.createdAt}</p>
                </div>
                <select value={selected.status} onChange={(event) => onUpdateStatus(selected.id, event.target.value)}>
                  <option>Açıq</option>
                  <option>İcrada</option>
                  <option>Gözləyir</option>
                  <option>Bağlandı</option>
                </select>
              </div>
              <div className="support-link-grid">
                <div>
                  <span>Müştəri</span>
                  <strong>{selected.customer || selected.customerRecord?.name || "—"}</strong>
                  <button className="text-btn" disabled={!(selected.fin || selected.customerRecord?.fin)} onClick={() => onOpenCustomer(selected.fin || selected.customerRecord?.fin)}>
                    CRM
                  </button>
                </div>
                <div>
                  <span>Sifariş</span>
                  <strong>{selected.orderId || selected.order?.id || "—"}</strong>
                  <button className="text-btn" disabled={!(selected.orderId || selected.order?.id)} onClick={() => onOpenSalesOrder(selected.orderId || selected.order?.id)}>
                    Satış
                  </button>
                </div>
                <div>
                  <span>Kredit</span>
                  <strong>{selected.creditId || selected.credit?.id || "—"}</strong>
                  <button className="text-btn" disabled={!(selected.creditId || selected.credit?.id)} onClick={() => onOpenCredit(selected.creditId || selected.credit?.id)}>
                    Kredit
                  </button>
                </div>
                <div>
                  <span>Thread</span>
                  <strong>{selected.thread?.messages?.length || 0} mesaj</strong>
                  <button className="text-btn" onClick={() => onOpenConversation(selected.id)}>
                    Mesajlar
                  </button>
                </div>
              </div>
              <div className="support-task-list">
                {(selected.tasks || []).map((task) => (
                  <div key={task.id}>
                    <TwoLine title={task.title} subtitle={`${task.id} · ${task.owner} · ${task.dueAt}`} />
                    <StatusBadge status={task.status} />
                  </div>
                ))}
              </div>
              <div className="support-comment-list" data-testid="support-comment-list">
                {selected.comments.map((comment) => (
                  <div key={comment.id} className="support-comment">
                    <div>
                      <strong>{comment.author}</strong>
                      <span>{comment.at}</span>
                    </div>
                    <p>{comment.text}</p>
                  </div>
                ))}
                {selected.comments.length === 0 && <EmptyState title="Comment yoxdur" />}
              </div>
              <div className="support-comment-composer">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Task üzrə comment yazın..."
                  data-testid="support-comment-input"
                />
                <button className="primary-btn" onClick={submitComment} data-testid="support-comment-submit">
                  <Send size={16} />
                  Comment
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Support task yoxdur" />
          )}
        </Panel>
      </section>
    </div>
  );
}