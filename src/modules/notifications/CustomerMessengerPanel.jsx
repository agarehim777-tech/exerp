import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, MessageCircle, Send } from "lucide-react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { NOTIFICATION_TEMPLATES, sendNotification, waMeLink } from "../../lib/notify.js";

export default function CustomerMessengerPanel({ companyName = "ExERP" }) {
  const { activeTenantId } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [channel, setChannel] = useState("whatsapp");
  const [customerId, setCustomerId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [templateCode, setTemplateCode] = useState("order_status");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!activeTenantId) return;
    (async () => {
      const [customerRes, orderRes, deliveryRes] = await Promise.all([
        supabase.from("customers").select("id,name,phone,telegram_chat_id").eq("tenant_id", activeTenantId).order("name").limit(300),
        supabase.from("orders").select("id,order_no,status,total,customer_id").eq("tenant_id", activeTenantId).order("order_date", { ascending: false }).limit(200),
        supabase.from("notification_deliveries").select("id,channel,recipient,status,body,created_at").eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(20),
      ]);
      setCustomers(customerRes.data || []);
      setOrders(orderRes.data || []);
      setDeliveries(deliveryRes.data || []);
    })();
  }, [activeTenantId]);

  const customer = customers.find((row) => row.id === customerId) || null;
  const customerOrders = useMemo(
    () => orders.filter((order) => !customerId || order.customer_id === customerId),
    [orders, customerId],
  );
  const order = customerOrders.find((row) => row.id === orderId) || null;

  useEffect(() => {
    const template = NOTIFICATION_TEMPLATES.find((row) => row.code === templateCode);
    if (!template || template.code === "custom") return;
    setText(template.build({ company: companyName, customer: customer?.name, order }));
  }, [templateCode, customer, order, companyName]);

  const recipient = channel === "telegram" ? customer?.telegram_chat_id : customer?.phone;
  const whatsappLink = channel === "whatsapp" ? waMeLink(customer?.phone, text) : null;

  const refreshLog = async () => {
    const { data } = await supabase.from("notification_deliveries")
      .select("id,channel,recipient,status,body,created_at")
      .eq("tenant_id", activeTenantId).order("created_at", { ascending: false }).limit(20);
    setDeliveries(data || []);
  };

  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendNotification({
        tenantId: activeTenantId,
        channel,
        recipient,
        body: text,
        templateCode,
        entityType: order ? "orders" : undefined,
        entityId: order?.id,
      });
      if (result?.link) window.open(result.link, "_blank", "noopener");
      setMessage({ tone: "ok", text: channel === "whatsapp" ? "WhatsApp söhbəti açıldı və jurnala yazıldı." : "Telegram mesajı göndərildi." });
      refreshLog();
    } catch (error) {
      setMessage({ tone: "err", text: error.message || String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <MessageCircle size={18} color="#0f766e" />
        <div>
          <div style={S.title}>Müştəri bildirişləri — WhatsApp / Telegram</div>
          <div style={S.sub}>Sifariş statusu və ödəniş xatırlatmalarını müştəriyə birbaşa göndərin.</div>
        </div>
      </div>

      <div style={S.row}>
        <div style={S.tabs}>
          <button onClick={() => setChannel("whatsapp")} style={{ ...S.tab, ...(channel === "whatsapp" ? S.tabOn : {}) }}>WhatsApp</button>
          <button onClick={() => setChannel("telegram")} style={{ ...S.tab, ...(channel === "telegram" ? S.tabOn : {}) }}>Telegram</button>
        </div>
        <select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setOrderId(""); }} style={S.input}>
          <option value="">Müştəri seçin</option>
          {customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
        <select value={orderId} onChange={(event) => setOrderId(event.target.value)} style={S.input}>
          <option value="">Sifariş (istəyə bağlı)</option>
          {customerOrders.map((row) => <option key={row.id} value={row.id}>№{row.order_no}</option>)}
        </select>
        <select value={templateCode} onChange={(event) => setTemplateCode(event.target.value)} style={S.input}>
          {NOTIFICATION_TEMPLATES.map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}
        </select>
      </div>

      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} style={S.textarea} placeholder="Mesaj mətni" />

      <div style={S.actions}>
        <span style={{ fontSize: 12, color: recipient ? "#475569" : "#b91c1c" }}>
          {recipient
            ? `Alıcı: ${recipient}`
            : channel === "telegram"
              ? "Müştərinin Telegram chat ID-si qeyd olunmayıb."
              : "Müştərinin telefon nömrəsi qeyd olunmayıb."}
        </span>
        {whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noreferrer" style={S.link}><ExternalLink size={14} /> Linki aç</a>
        )}
        <button onClick={send} disabled={busy || !recipient || !text.trim() || !activeTenantId} style={S.primary}>
          <Send size={15} /> {channel === "whatsapp" ? "WhatsApp-da aç və qeyd et" : "Telegram-a göndər"}
        </button>
      </div>

      {message && <div style={message.tone === "ok" ? S.ok : S.err}>{message.text}</div>}

      {deliveries.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Son göndərişlər</div>
          <div style={{ display: "grid", gap: 4 }}>
            {deliveries.map((row) => (
              <div key={row.id} style={S.logRow}>
                <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{row.channel}</span>
                <span style={{ color: "#475569" }}>{row.recipient}</span>
                <span style={{ color: row.status === "sent" ? "#15803d" : row.status === "failed" ? "#b91c1c" : "#b45309" }}>{row.status}</span>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{new Date(row.created_at).toLocaleString("az-AZ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  wrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, display: "grid", gap: 12 },
  head: { display: "flex", gap: 10, alignItems: "center" },
  title: { fontSize: 15, fontWeight: 800, color: "#0f172a" },
  sub: { fontSize: 12, color: "#64748b" },
  row: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  tabs: { display: "flex", gap: 6 },
  tab: { padding: "8px 14px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  tabOn: { background: "#0f766e", color: "#fff", borderColor: "#0f766e" },
  input: { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, background: "#fff", minWidth: 170 },
  textarea: { width: "100%", padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13, fontFamily: "inherit", resize: "vertical" },
  actions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  link: { display: "inline-flex", gap: 5, alignItems: "center", fontSize: 13, color: "#0f766e", fontWeight: 600 },
  primary: { marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", padding: "9px 16px", borderRadius: 9, border: "none", background: "#0f766e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 },
  ok: { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: 10, borderRadius: 8, fontSize: 13 },
  err: { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 10, borderRadius: 8, fontSize: 13 },
  logRow: { display: "grid", gridTemplateColumns: "90px 1fr 80px auto", gap: 8, alignItems: "center", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #f1f5f9" },
};
