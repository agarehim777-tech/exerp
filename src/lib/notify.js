import { supabase } from "../integrations/supabase/client";

const money = (value) => `${Number(value || 0).toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;

export const ORDER_STATUS_LABELS = {
  draft: "qeydə alındı",
  confirmed: "təsdiqləndi",
  shipped: "yola salındı",
  delivered: "təhvil verildi",
  cancelled: "ləğv edildi",
};

export const NOTIFICATION_TEMPLATES = [
  {
    code: "order_status",
    label: "Sifariş statusu",
    build: ({ company, customer, order }) =>
      `Hörmətli ${customer || "müştəri"},\n№${order?.order_no || "—"} sifarişiniz ${ORDER_STATUS_LABELS[order?.status] || order?.status || "yeniləndi"}.\nMəbləğ: ${money(order?.total)}\n\n${company || "ExERP"}`,
  },
  {
    code: "order_ready",
    label: "Sifariş hazırdır",
    build: ({ company, customer, order }) =>
      `Hörmətli ${customer || "müştəri"},\n№${order?.order_no || "—"} sifarişiniz hazırdır və təhvilə göndərilir.\nMəbləğ: ${money(order?.total)}\n\n${company || "ExERP"}`,
  },
  {
    code: "payment_reminder",
    label: "Ödəniş xatırlatması",
    build: ({ company, customer, order }) =>
      `Hörmətli ${customer || "müştəri"},\n№${order?.order_no || "—"} sifariş üzrə ödəniş gözlənilir.\nMəbləğ: ${money(order?.total)}\nXahiş edirik ödənişi vaxtında həyata keçirəsiniz.\n\n${company || "ExERP"}`,
  },
  {
    code: "custom",
    label: "Sərbəst mətn",
    build: () => "",
  },
];

export function waMeLink(phone, text) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text || "")}`;
}

export async function sendNotification({ tenantId, channel, recipient, body, templateCode, entityType, entityId }) {
  const { data, error } = await supabase.functions.invoke("send-notification", {
    body: { tenantId, channel, recipient, body, templateCode, entityType, entityId },
  });
  if (error) {
    let details = error.message;
    try { details = await error.context?.text?.() ?? details; } catch { /* ignore */ }
    throw new Error(details);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
