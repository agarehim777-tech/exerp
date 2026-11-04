import { currentBusinessDate, getSupportThreadId } from "../lib/appDomain.jsx";
import { getInitials, getMessageContextPayload, normalizeMessageThread, upsertSupportConversation } from "../lib/appHelpers.jsx";

// Support ticket and message thread commands for the browser state (comments, status,
// conversations, sending), moved out of App.jsx unchanged. App passes in the state, its
// setters and the audit/notification helpers they use.
export function createMessagingActions({ activeRoleInfo, auditCurrentState, auditOperation, conversationId, creditRecords, currentUser, draftMessage, getActionStamp, messageContextOptions, messageParticipantOptions, notify, requirePermission, setActive, setConversationId, setDraftMessage, setMobileNav, setQuery, setSelectedSupportTicketId, setState, state, syncCommunicationWorkflow }) {
  function addSupportTicketComment(ticketId, text) {
    if (!requirePermission("support.manage", "support taskına comment yazmaq")) return;
    const body = String(text || "").trim();
    if (!body) return;
    const stamp = getActionStamp();
    const comment = {
      id: `COM-${Date.now().toString().slice(-6)}`,
      author: activeRoleInfo?.name || "Admin",
      text: body,
      at: stamp,
      mine: true,
    };

    setState((current) => {
      const targetTicket = (current.supportTickets || []).find((ticket) => ticket.id === ticketId);
      if (!targetTicket) return current;
      const nextTicket = {
        ...targetTicket,
        status: targetTicket.status === "Bağlandı" ? "İcrada" : targetTicket.status,
        comments: [...(targetTicket.comments || []), comment],
      };
      return auditCurrentState(
        {
          ...current,
          supportTickets: (current.supportTickets || []).map((ticket) => (ticket.id === ticketId ? nextTicket : ticket)),
          conversations: upsertSupportConversation(current.conversations || [], nextTicket, comment),
        },
        {
          module: "Support/Mesaj",
          action: "Task comment əlavə edildi",
          detail: `${ticketId} · ${body.slice(0, 80)}`,
        },
      );
    });
    notify("Comment task və mesaj thread-inə əlavə edildi.");
  }

  function updateSupportTicketStatus(ticketId, status) {
    if (!requirePermission("support.manage", "support task statusunu dəyişmək")) return;
    const stamp = getActionStamp();
    const comment = {
      id: `COM-${Date.now().toString().slice(-6)}`,
      author: activeRoleInfo?.name || "Admin",
      text: `Status dəyişdi: ${status}`,
      at: stamp,
      mine: true,
    };

    setState((current) => {
      const targetTicket = (current.supportTickets || []).find((ticket) => ticket.id === ticketId);
      if (!targetTicket) return current;
      const nextTicket = {
        ...targetTicket,
        status,
        resolvedAt: status === "Bağlandı" ? stamp : targetTicket.resolvedAt,
        comments: [...(targetTicket.comments || []), comment],
        tasks: (targetTicket.tasks || []).map((task) => ({
          ...task,
          status: status === "Bağlandı" ? "Tamamlandı" : status === "İcrada" ? "İcrada" : task.status,
        })),
      };
      return auditCurrentState(
        {
          ...current,
          supportTickets: (current.supportTickets || []).map((ticket) => (ticket.id === ticketId ? nextTicket : ticket)),
          conversations: upsertSupportConversation(current.conversations || [], nextTicket, comment),
        },
        {
          module: "Support",
          action: "Task statusu dəyişdi",
          detail: `${ticketId} · ${status}`,
        },
      );
    });
    notify(`${ticketId} statusu yeniləndi: ${status}.`);
  }

  function openSupportConversation(ticketId) {
    const ticket = state.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) {
      notify("Support task tapılmadı.", "warning");
      return;
    }
    setConversationId(getSupportThreadId(ticket));
    setQuery("");
    setActive("messages");
    setMobileNav(false);
    auditOperation({
      module: "Support/Mesaj",
      action: "Task thread-inə keçid edildi",
      detail: `${ticket.id} · ${ticket.title}`,
    });
  }

  function openSupportTicket(ticketId) {
    const ticket = state.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) {
      notify("Support task tapılmadı.", "warning");
      return;
    }
    setSelectedSupportTicketId(ticketId);
    setQuery("");
    setActive("support");
    setMobileNav(false);
    auditOperation({
      module: "Mesaj/Support",
      action: "Bağlı task-a keçid edildi",
      detail: `${ticket.id} · ${ticket.title}`,
    });
  }

  function openLinkedCustomer(fin) {
    const customer = state.customers.find((item) => item.fin === fin);
    if (!customer) {
      notify("Bağlı müştəri tapılmadı.", "warning");
      return;
    }
    setQuery(fin);
    setActive("crm");
    setMobileNav(false);
    auditOperation({
      module: "Support/CRM",
      action: "Bağlı müştəriyə keçid edildi",
      detail: `${customer.name} · ${fin}`,
    });
  }

  function selectMessageThread(id) {
    setConversationId(id);
    setState((current) => {
      const target = (current.conversations || []).find((conversation) => conversation.id === id);
      if (!target || Number(target.unread || 0) === 0) return current;
      return {
        ...current,
        conversations: (current.conversations || []).map((conversation) =>
          conversation.id === id
            ? {
                ...conversation,
                unread: 0,
                messages: (conversation.messages || []).map((message) => ({
                  ...message,
                  readAt: message.readAt || currentBusinessDate,
                })),
              }
            : conversation,
        ),
      };
    });
  }

  function createMessageConversation(values = {}) {
    if (!requirePermission("messages.manage", "mesaj söhbəti və qrup yaratmaq")) return;
    const stamp = getActionStamp();
    const participantIds = values.participantIds || [];
    const participantNames = messageParticipantOptions
      .filter((participant) => participantIds.includes(participant.id))
      .map((participant) => participant.name);
    const currentName = currentUser?.name || activeRoleInfo?.name || "Admin";
    const participants = [...new Set([currentName, ...participantNames].filter(Boolean))];
    const context = getMessageContextPayload(values.linkedType, values.linkedId, {
      customers: state.customers,
      orders: state.orders,
      credits: creditRecords,
      tickets: state.supportTickets || [],
    });
    const contextLabel =
      messageContextOptions.find((item) => item.type === values.linkedType && item.id === values.linkedId)?.label ||
      context.linkedLabel ||
      "";
    const type = values.type || (participants.length > 2 ? "group" : "direct");
    const title =
      values.title?.trim() ||
      (type === "group" ? "Yeni qrup" : participantNames[0]) ||
      contextLabel ||
      "Yeni söhbət";
    const body = values.firstMessage?.trim();
    const initialMessages = body
      ? [
          {
            id: `MSG-TEXT-${Date.now().toString().slice(-6)}`,
            from: currentName,
            text: body,
            time: stamp,
            mine: true,
            status: "Göndərildi",
            readAt: stamp,
          },
        ]
      : [];
    const conversation = normalizeMessageThread({
      id: `MSG-${Date.now().toString().slice(-6)}`,
      type,
      title,
      person: title,
      initials: getInitials(title),
      team: values.team || (type === "group" ? "Qrup" : "Daxili"),
      participants,
      participantIds,
      createdAt: stamp,
      createdBy: currentName,
      status: "Aktiv",
      archived: false,
      preview: body || "Söhbət yaradıldı",
      time: stamp,
      unread: 0,
      ...context,
      messages: initialMessages,
    });

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          conversations: [conversation, ...(current.conversations || [])],
        },
        {
          module: "Mesajlar",
          action: type === "group" ? "Qrup yaradıldı" : "Söhbət yaradıldı",
          detail: `${title}${contextLabel ? ` · ${contextLabel}` : ""}`,
        },
      ),
    );
    setConversationId(conversation.id);
    setDraftMessage("");
    notify(type === "group" ? "Qrup yaradıldı." : "Yeni söhbət yaradıldı.");
    queueMicrotask(() => syncCommunicationWorkflow(conversation));
  }

  function archiveMessageConversation(id) {
    if (!requirePermission("messages.manage", "mesaj söhbətini arxivləmək")) return;
    const target = state.conversations.find((conversation) => conversation.id === id);
    if (!target) {
      notify("Söhbət tapılmadı.", "warning");
      return;
    }
    const nextArchived = !(target.archived || target.status === "Arxiv");
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          conversations: (current.conversations || []).map((conversation) =>
            conversation.id === id
              ? {
                  ...conversation,
                  archived: nextArchived,
                  status: nextArchived ? "Arxiv" : "Aktiv",
                }
              : conversation,
          ),
        },
        {
          module: "Mesajlar",
          action: nextArchived ? "Söhbət arxivləndi" : "Söhbət arxivdən çıxarıldı",
          detail: target.title || target.person || id,
        },
      ),
    );
    notify(nextArchived ? "Söhbət arxivləndi." : "Söhbət arxivdən çıxarıldı.");
    queueMicrotask(() => syncCommunicationWorkflow(
      { ...target, archived: nextArchived, status: nextArchived ? "Arxiv" : "Aktiv" },
      nextArchived ? "archived" : "active",
    ));
  }

  function deleteMessageConversation(id) {
    if (!requirePermission("messages.manage", "mesaj söhbətini silmək")) return;
    const target = state.conversations.find((conversation) => conversation.id === id);
    if (!target) {
      notify("Söhbət tapılmadı.", "warning");
      return;
    }
    const nextConversation = state.conversations.find((conversation) => conversation.id !== id);
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          conversations: (current.conversations || []).filter((conversation) => conversation.id !== id),
        },
        {
          module: "Mesajlar",
          action: "Söhbət silindi",
          detail: target.title || target.person || id,
        },
      ),
    );
    setConversationId(nextConversation?.id || "");
    notify("Söhbət silindi.");
  }

  function sendMessage() {
    if (!requirePermission("messages.send", "daxili mesaj göndərmək")) return;
    const body = draftMessage.trim();
    if (!body) return;
    const stamp = getActionStamp();
    const sender = currentUser?.name || activeRoleInfo?.name || "Admin";
    const selectedThreadForSync = (state.conversations || []).find((conversation) => conversation.id === conversationId);
    const comment = {
      id: `COM-${Date.now().toString().slice(-6)}`,
      author: sender,
      text: body,
      at: stamp,
      mine: true,
    };
    setState((current) => {
      const selectedConversation = (current.conversations || []).find((conversation) => conversation.id === conversationId);
      if (!selectedConversation) return current;
      const ticketId = selectedConversation?.ticketId;
      const nextConversations = (current.conversations || []).map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              preview: body,
              unread: 0,
              time: stamp,
              status: "Aktiv",
              archived: false,
              messages: [
                ...(conversation.messages || []),
                {
                  id: `MSG-TEXT-${Date.now().toString().slice(-6)}`,
                  from: sender,
                  text: body,
                  time: stamp,
                  mine: true,
                  status: "Göndərildi",
                  readAt: stamp,
                  commentId: comment.id,
                },
              ],
            }
          : conversation,
      );
      const nextTickets = ticketId
        ? (current.supportTickets || []).map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  status: ticket.status === "Bağlandı" ? "İcrada" : ticket.status,
                  comments: [...(ticket.comments || []), comment],
                }
              : ticket,
          )
        : current.supportTickets;

      return auditCurrentState(
        {
          ...current,
          conversations: nextConversations,
          supportTickets: nextTickets,
        },
        {
          module: ticketId ? "Mesaj/Support" : "Mesaj",
          action: ticketId ? "Bağlı task-a mesaj yazıldı" : "Daxili mesaj göndərildi",
          detail: selectedConversation?.title || selectedConversation?.person || ticketId || conversationId,
        },
      );
    });
    setDraftMessage("");
    if (selectedThreadForSync) {
      queueMicrotask(() => syncCommunicationWorkflow({
        ...selectedThreadForSync,
        preview: body,
        archived: false,
        messages: [
          ...(selectedThreadForSync.messages || []),
          { id: comment.id, from: sender, text: body, time: stamp, status: "Göndərildi", readAt: stamp },
        ],
      }));
    }
  }

  return { addSupportTicketComment, updateSupportTicketStatus, openSupportConversation, openSupportTicket, openLinkedCustomer, selectMessageThread, createMessageConversation, archiveMessageConversation, deleteMessageConversation, sendMessage };
}
