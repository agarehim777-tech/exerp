// Daxili mesajlaşma: söhbət normallaşdırması, iştirakçı və bağlantı seçimləri, support tiketi söhbətləri.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { money, normalize } from "../../services/format.js";
import { getSupportThreadId } from "./appDomainFinance.jsx";

type Row = Record<string, any>;

export interface ChatMessage {
  from: unknown;
  text: unknown;
  time: unknown;
  mine: boolean;
  commentId?: unknown;
  [key: string]: unknown;
}

export interface MessageThread extends Row {
  id?: string;
  title: unknown;
  person: unknown;
  type: string;
  status: "Aktiv" | "Arxiv";
  archived: boolean;
  initials: unknown;
  team: unknown;
  participants: unknown[];
  preview: unknown;
  time: unknown;
  unread: number;
  messages: Row[];
}

export interface ParticipantOption {
  id: unknown;
  name: unknown;
  role: unknown;
  team: unknown;
  source: "user" | "employee";
}

export interface ContextOption {
  type: "" | "customer" | "order" | "credit" | "support";
  id: unknown;
  label: unknown;
  detail: string;
}

export interface MessageContextSources {
  customers?: Row[];
  orders?: Row[];
  credits?: Row[];
  tickets?: Row[];
}

function getInitials(value: unknown = "ERP"): string {
  const words = String(value || "ERP")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "E";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("az-AZ");
}

function buildSupportMessageFromComment(comment: Row): ChatMessage {
  return {
    from: comment.author || "Admin",
    text: comment.text,
    time: comment.at || "indi",
    mine: comment.mine !== false,
    commentId: comment.id,
  };
}

function buildSupportConversation(ticket: Row, comment: Row) {
  const firstMessage = buildSupportMessageFromComment(comment);
  const person = ticket.linkedLabel || ticket.customer || ticket.title || ticket.id;
  return {
    id: getSupportThreadId(ticket),
    type: "task",
    status: "Aktiv",
    ticketId: ticket.id,
    linkedType: ticket.linkedType,
    linkedId: ticket.linkedId,
    orderId: ticket.orderId,
    creditId: ticket.creditId,
    customerFin: ticket.fin,
    person,
    initials: getInitials(person),
    team: ticket.module || "Support",
    preview: firstMessage.text,
    time: firstMessage.time,
    unread: 0,
    participants: [ticket.owner || "Support", firstMessage.from].filter(Boolean),
    messages: [firstMessage],
  };
}

function normalizeMessageThread(conversation: Row = {}): MessageThread {
  const title = conversation.title || conversation.person || conversation.name || conversation.id || "Söhbət";
  const type = conversation.type || (conversation.ticketId ? "task" : (conversation.participants || []).length > 2 ? "group" : "direct");
  const messages: Row[] = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1] || null;

  return {
    ...conversation,
    title,
    person: conversation.person || title,
    type,
    status: conversation.archived || conversation.status === "Arxiv" ? "Arxiv" : "Aktiv",
    archived: Boolean(conversation.archived || conversation.status === "Arxiv"),
    initials: conversation.initials || getInitials(title),
    team: conversation.team || conversation.department || (type === "group" ? "Qrup" : "Daxili"),
    participants: Array.isArray(conversation.participants) ? conversation.participants : [],
    preview: conversation.preview || lastMessage?.text || "Mesaj yoxdur",
    time: conversation.time || lastMessage?.time || conversation.createdAt || "Yeni",
    unread: Number(conversation.unread || 0),
    messages,
  };
}

function buildMessageParticipantOptions(settings: { users?: Row[] } = {}, employees: Row[] = []): ParticipantOption[] {
  const users: ParticipantOption[] = (settings.users || []).map((user) => ({
    id: user.id,
    name: user.name || user.email || user.id,
    role: user.role || "İstifadəçi",
    team: user.role || "Sistem",
    source: "user",
  }));
  const staff: ParticipantOption[] = (employees || []).map((employee) => ({
    id: employee.id,
    name: employee.name || employee.fullName || employee.id,
    role: employee.position || employee.role || "Əməkdaş",
    team: employee.department || "HR",
    source: "employee",
  }));
  const byKey = new Map<string, ParticipantOption>();

  [...users, ...staff]
    .filter((item) => item.id && item.name)
    .forEach((item) => {
      const key = normalize(`${item.source}-${item.id}-${item.name}`);
      if (!byKey.has(key)) byKey.set(key, item);
    });

  return [...byKey.values()];
}

function buildMessageContextOptions({ customers = [], orders = [], credits = [], tickets = [] }: MessageContextSources = {}): ContextOption[] {
  const customerOptions: ContextOption[] = customers.slice(0, 60).map((customer) => ({
    type: "customer",
    id: customer.fin || customer.id,
    label: customer.name || customer.fin || customer.id,
    detail: customer.fin ? `Müştəri · FİN ${customer.fin}` : "Müştəri",
  }));
  const orderOptions: ContextOption[] = orders.slice(0, 60).map((order) => ({
    type: "order",
    id: order.id,
    label: order.id,
    detail: `${order.customer || order.customerName || "Sifariş"} · ${money(order.amount || order.total || order.totalAmount || 0)}`,
  }));
  const creditOptions: ContextOption[] = credits.slice(0, 60).map((credit) => ({
    type: "credit",
    id: credit.id,
    label: credit.contractId || credit.id,
    detail: `${credit.customer || "Kredit"} · qalıq ${money(credit.remaining || credit.balance || credit.amount || 0)}`,
  }));
  const ticketOptions: ContextOption[] = tickets.slice(0, 60).map((ticket) => ({
    type: "support",
    id: ticket.id,
    label: ticket.title || ticket.id,
    detail: `${ticket.module || "Support"} · ${ticket.status || "Aktiv"}`,
  }));

  return [
    { type: "", id: "", label: "Bağlantı yoxdur", detail: "Ümumi daxili yazışma" },
    ...customerOptions,
    ...orderOptions,
    ...creditOptions,
    ...ticketOptions,
  ];
}

function getMessageContextPayload(linkedType: unknown, linkedId: unknown, { customers = [], orders = [], credits = [], tickets = [] }: MessageContextSources = {}): Row {
  if (!linkedType || !linkedId) return {};

  if (linkedType === "customer") {
    const customer = customers.find((item) => item.fin === linkedId || item.id === linkedId);
    return {
      linkedType,
      linkedId,
      customerFin: customer?.fin || linkedId,
      linkedLabel: customer?.name || linkedId,
    };
  }

  if (linkedType === "order") {
    const order = orders.find((item) => item.id === linkedId);
    return {
      linkedType,
      linkedId,
      orderId: linkedId,
      customerFin: order?.fin,
      linkedLabel: order ? `${order.id} · ${order.customer || order.customerName || "Sifariş"}` : linkedId,
    };
  }

  if (linkedType === "credit") {
    const credit = credits.find((item) => item.id === linkedId || item.contractId === linkedId);
    return {
      linkedType,
      linkedId,
      creditId: credit?.id || linkedId,
      orderId: credit?.orderId,
      customerFin: credit?.fin,
      linkedLabel: credit?.contractId || credit?.id || linkedId,
    };
  }

  if (linkedType === "support") {
    const ticket = tickets.find((item) => item.id === linkedId);
    return {
      linkedType: ticket?.linkedType || "support",
      linkedId,
      ticketId: linkedId,
      orderId: ticket?.orderId,
      creditId: ticket?.creditId,
      customerFin: ticket?.fin,
      linkedLabel: ticket?.title || linkedId,
    };
  }

  return { linkedType, linkedId };
}

function upsertSupportConversation(conversations: Row[] = [], ticket: Row, comment: Row): Row[] {
  const threadId = getSupportThreadId(ticket);
  const message = buildSupportMessageFromComment(comment);
  const existing = conversations.find((conversation) => conversation.id === threadId || conversation.ticketId === ticket.id);

  if (!existing) {
    return [buildSupportConversation(ticket, comment), ...(conversations || [])];
  }

  return conversations.map((conversation) =>
    conversation.id === existing.id
      ? {
          ...conversation,
          ticketId: ticket.id,
          linkedType: ticket.linkedType,
          linkedId: ticket.linkedId,
          orderId: ticket.orderId,
          creditId: ticket.creditId,
          customerFin: ticket.fin,
          preview: comment.text,
          time: comment.at || "indi",
          unread: 0,
          messages: [...(conversation.messages || []), message],
        }
      : conversation,
  );
}

export {
  getInitials,
  buildSupportMessageFromComment,
  buildSupportConversation,
  normalizeMessageThread,
  buildMessageParticipantOptions,
  buildMessageContextOptions,
  getMessageContextPayload,
  upsertSupportConversation,
};
