import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const num = (value: unknown) => Number(value ?? 0) || 0;

type Insight = {
  key: string;
  category: "sales" | "procurement" | "inventory" | "receivables" | "hr" | "general";
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  action: string;
  impact: string;
};

const money = (value: number) => `${value.toLocaleString("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;

function buildInsights(signals: any, dismissedKeys: Set<string>): Insight[] {
  const insights: Insight[] = [];
  const add = (insight: Insight) => {
    if (!dismissedKeys.has(insight.key)) insights.push(insight);
  };

  if (signals.overdueCreditTotal > 0) {
    add({
      key: "overdue-credit-collection",
      category: "receivables",
      priority: "high",
      title: "Gecikmiş kredit ödənişlərini toplayın",
      detail: `${signals.overdueCredit.length} kredit üzrə ümumilikdə ${money(signals.overdueCreditTotal)} gecikmiş borc var.`,
      action: "Ən köhnə gecikmələrdən başlayaraq müştərilərlə əlaqə saxlayın və ödəniş planını yeniləyin.",
      impact: `${money(signals.overdueCreditTotal)} pul axını riski`,
    });
  }

  if (signals.overdueInvoiceTotal > 0) {
    add({
      key: "overdue-invoice-collection",
      category: "receivables",
      priority: "high",
      title: "Vaxtı keçmiş fakturaları bağlayın",
      detail: `${signals.overdueInvoices.filter((row: any) => row.overdue).length} faktura üzrə ${money(signals.overdueInvoiceTotal)} vaxtı keçmiş debitor borcu var.`,
      action: "Məsul şəxsləri təyin edin və fakturalar üzrə ödəniş tarixlərini təsdiqləyin.",
      impact: `${money(signals.overdueInvoiceTotal)} debitor riski`,
    });
  }

  if (signals.lowStockCount > 0) {
    const sample = signals.lowStock.slice(0, 3).map((row: any) => `${row.product} (${row.qty})`).join(", ");
    add({
      key: "low-stock-replenishment",
      category: "inventory",
      priority: signals.lowStockCount >= 5 ? "high" : "medium",
      title: "Azalan stokları tamamlayın",
      detail: `${signals.lowStockCount} məhsul aşağı qalıqdadır${sample ? `: ${sample}` : ""}.`,
      action: "Minimum stok və açıq satınalma sifarişlərini müqayisə edib çatışmayan miqdar üçün PO yaradın.",
      impact: `${signals.lowStockCount} məhsul üzrə satış itkisi riski`,
    });
  }

  if (signals.openOrders.length > 0) {
    add({
      key: "open-sales-orders",
      category: "sales",
      priority: "medium",
      title: "Açıq satış sifarişlərini tamamlayın",
      detail: `${signals.openOrders.length} satış sifarişi təsdiq və ya təhvil mərhələsini gözləyir.`,
      action: "Anbar rezervini və təhvil imkanını yoxlayıb gecikən sifarişlərə məsul şəxs təyin edin.",
      impact: `${signals.openOrders.length} açıq sifariş`,
    });
  }

  if (signals.openPurchaseOrders.length > 0) {
    add({
      key: "open-purchase-orders",
      category: "procurement",
      priority: "medium",
      title: "Açıq satınalma sifarişlərini izləyin",
      detail: `${signals.openPurchaseOrders.length} satınalma sifarişi hələ tam qəbul edilməyib.`,
      action: "Vendorlardan gözlənilən tarixləri dəqiqləşdirin və gecikən mədaxilləri prioritetləşdirin.",
      impact: `${signals.openPurchaseOrders.length} açıq PO`,
    });
  }

  if (!insights.length) {
    insights.push({
      key: "operations-stable",
      category: "general",
      priority: "low",
      title: "Kritik əməliyyat riski görünmür",
      detail: "Cari 30 günlük məlumatda gecikmiş borc, aşağı stok və açıq əməliyyat siqnalı tapılmadı.",
      action: "Göstəriciləri mütəmadi izləməyə davam edin.",
      impact: "Kritik risk yoxdur",
    });
  }

  return insights.slice(0, 8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not authenticated" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return json({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantId: string | undefined = body?.tenantId;
    if (!tenantId) return json({ error: "Aktiv şirkət seçilməyib" }, 400);

    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const from = new Date(today);
    from.setDate(from.getDate() - 30);

    // ---- Deterministik siqnallar (RLS ilə cari şirkətə məhdudlaşır) ----
    const [balances, overdueInstallments, openOrders, openPos, invoices, dashboard] = await Promise.all([
      supabase.from("stock_balances")
        .select("on_hand,reserved,problem_qty,minimum_level,product:products(name,sku,price,minimum_stock)")
        .limit(500),
      supabase.from("credit_installments")
        .select("due_date,principal_due,principal_paid,penalty_due,penalty_paid,status,credit:credit_contracts(contract_no,customer:customers(name))")
        .lte("due_date", iso(today)).neq("status", "paid").order("due_date").limit(60),
      supabase.from("orders").select("order_no,order_date,status,total,payment_status,customer:customers(name)")
        .in("status", ["draft", "confirmed"]).order("order_date", { ascending: false }).limit(60),
      supabase.from("purchase_orders").select("po_number,order_date,status,vendor:vendors(name)")
        .in("status", ["draft", "approved", "partial"]).order("order_date", { ascending: false }).limit(60),
      supabase.from("sales_invoices").select("invoice_no,due_date,total,paid_amount,status,customer:customers(name)")
        .in("status", ["issued", "partial", "overdue"]).order("due_date").limit(60),
      supabase.rpc("sales_dashboard", { _tenant: tenantId, _from: iso(from), _to: iso(today) }),
    ]);

    const lowStock = (balances.data ?? [])
      .map((row: any) => ({
        product: row.product?.name ?? "—",
        sku: row.product?.sku ?? "",
        qty: num(row.on_hand) - num(row.reserved) - num(row.problem_qty),
        minimum: Math.max(num(row.minimum_level), num(row.product?.minimum_stock)),
      }))
      .filter((row: any) => row.qty <= row.minimum)
      .slice(0, 25)
      .map((row: any) => ({ product: row.product, sku: row.sku, qty: row.qty, minimum: row.minimum }));

    const overdueCredit = (overdueInstallments.data ?? []).map((row: any) => ({
      contract: row.credit?.contract_no ?? "—",
      customer: row.credit?.customer?.name ?? "—",
      dueDate: row.due_date,
      remaining: num(row.principal_due) - num(row.principal_paid) + num(row.penalty_due) - num(row.penalty_paid),
    })).filter((row) => row.remaining > 0);

    const overdueInvoices = (invoices.data ?? []).map((row: any) => ({
      invoice: row.invoice_no,
      customer: row.customer?.name ?? "—",
      dueDate: row.due_date,
      remaining: num(row.total) - num(row.paid_amount),
      overdue: row.due_date ? row.due_date < iso(today) : false,
    })).filter((row) => row.remaining > 0);

    const signals = {
      period: { from: iso(from), to: iso(today) },
      salesSummary: dashboard.data ?? null,
      lowStock,
      lowStockCount: lowStock.length,
      overdueCredit: overdueCredit.slice(0, 20),
      overdueCreditTotal: overdueCredit.reduce((sum, row) => sum + row.remaining, 0),
      overdueInvoices: overdueInvoices.slice(0, 20),
      overdueInvoiceTotal: overdueInvoices.filter((r) => r.overdue).reduce((sum, row) => sum + row.remaining, 0),
      openOrders: (openOrders.data ?? []).slice(0, 20),
      openPurchaseOrders: (openPos.data ?? []).slice(0, 20),
    };

    // ---- Özünüöyrənmə: keçmiş rəy (qəbul/rədd) modelə ötürülür ----
    const { data: feedback } = await supabase
      .from("ai_insight_feedback")
      .select("insight_key,category,title,action,note,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(40);

    const dismissed = (feedback ?? []).filter((f) => f.action === "dismissed");
    const dismissedKeys = new Set(dismissed.map((row) => String(row.insight_key || "")));
    const insights = buildInsights(signals, dismissedKeys);

    return json({
      generatedAt: new Date().toISOString(),
      signals: {
        lowStockCount: signals.lowStockCount,
        overdueCreditTotal: signals.overdueCreditTotal,
        overdueInvoiceTotal: signals.overdueInvoiceTotal,
        openOrderCount: signals.openOrders.length,
        openPurchaseOrderCount: signals.openPurchaseOrders.length,
      },
      insights,
    });
  } catch (error) {
    console.error("erp-insights error", error);
    return json({ error: String((error as Error)?.message || error) }, 500);
  }
});
