import { generateText } from "npm:ai";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY konfiqurasiya olunmayıb" }, 500);

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
      supabase.from("stock_balances").select("qty,product:products(name,sku,price)").limit(500),
      supabase.from("credit_installments")
        .select("due_date,amount_due,amount_paid,status,credit:credit_contracts(contract_no,customer:customers(name))")
        .lte("due_date", iso(today)).neq("status", "paid").order("due_date").limit(60),
      supabase.from("orders").select("order_no,order_date,status,total,payment_status,customer:customers(name)")
        .in("status", ["draft", "confirmed"]).order("order_date", { ascending: false }).limit(60),
      supabase.from("purchase_orders").select("po_no,order_date,status,total,vendor:vendors(name)")
        .in("status", ["draft", "approved", "partial"]).order("order_date", { ascending: false }).limit(60),
      supabase.from("sales_invoices").select("invoice_no,due_date,total,paid_amount,status,customer:customers(name)")
        .in("status", ["issued", "partial", "overdue"]).order("due_date").limit(60),
      supabase.rpc("sales_dashboard", { _tenant: tenantId, _from: iso(from), _to: iso(today) }),
    ]);

    const lowStock = (balances.data ?? [])
      .filter((row: any) => num(row.qty) <= 5)
      .slice(0, 25)
      .map((row: any) => ({ product: row.product?.name ?? "—", sku: row.product?.sku ?? "", qty: num(row.qty) }));

    const overdueCredit = (overdueInstallments.data ?? []).map((row: any) => ({
      contract: row.credit?.contract_no ?? "—",
      customer: row.credit?.customer?.name ?? "—",
      dueDate: row.due_date,
      remaining: num(row.amount_due) - num(row.amount_paid),
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

    const accepted = (feedback ?? []).filter((f) => f.action !== "dismissed");
    const dismissed = (feedback ?? []).filter((f) => f.action === "dismissed");

    const gateway = createLovableAiGatewayProvider(key);

    const system = `Sən ExERP sisteminin "AI Agent v2" analitik məsləhətçisisən.
Sənə şirkətin real ERP siqnalları verilir: satış xülasəsi, az qalan anbar məhsulları, vaxtı keçmiş kredit ödənişləri və fakturalar, açıq satış/satınalma sifarişləri.
Vəzifən: 4-8 KONKRET, icra oluna bilən tövsiyə hazırlamaq.

Cavabı YALNIZ aşağıdakı JSON formatında ver (əlavə mətn yoxdur):
{"insights":[{"key":"qisa-latin-acar","category":"sales|procurement|inventory|receivables|hr","priority":"high|medium|low","title":"Qısa başlıq","detail":"2-3 cümlə izah, rəqəmlərlə","action":"Atılacaq konkret addım","impact":"Təxmini təsir, məs. 1 200 ₼ risk"}]}

Qaydalar:
- Azərbaycan dilində yaz, məbləğləri ₼ ilə göstər.
- Yalnız verilən datadan çıxış et, uydurma.
- İstifadəçinin əvvəl RƏDD etdiyi tövsiyə tiplərini təkrarlama.
- İstifadəçinin əvvəl QƏBUL etdiyi tövsiyə tiplərinə üstünlük ver və davamını təklif et.`;

    const prompt = `SİQNALLAR:\n${JSON.stringify(signals).slice(0, 24000)}\n\nƏVVƏL QƏBUL EDİLƏN TÖVSİYƏLƏR:\n${JSON.stringify(accepted.map((f) => ({ key: f.insight_key, title: f.title, note: f.note }))).slice(0, 3000)}\n\nƏVVƏL RƏDD EDİLƏN TÖVSİYƏLƏR (təkrarlama):\n${JSON.stringify(dismissed.map((f) => ({ key: f.insight_key, title: f.title, note: f.note }))).slice(0, 3000)}`;

    const result = await generateText({
      model: gateway("openai/gpt-5.6-sol"),
      system,
      prompt,
    });

    let insights: unknown[] = [];
    try {
      const text = result.text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
      const parsed = JSON.parse(text);
      insights = Array.isArray(parsed?.insights) ? parsed.insights : [];
    } catch (_error) {
      insights = [];
    }

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
      raw: insights.length ? undefined : result.text.slice(0, 2000),
    });
  } catch (error) {
    console.error("erp-insights error", error);
    return json({ error: String((error as Error)?.message || error) }, 500);
  }
});
