import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY not set" }, 500);

    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
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

    const { messages, tenantId }: { messages: UIMessage[]; tenantId?: string } = await req.json();

    const gateway = createLovableAiGatewayProvider(key);

    const tools = {
      list_customers: tool({
        description: "Aktiv tenant üçün müştəri siyahısını qaytarır. Ad, e-poçt, telefon, seqment.",
        inputSchema: z.object({
          search: z.string().optional().describe("Ad və ya e-poçt üzrə axtarış"),
          limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ search, limit }) => {
          let q = supabase.from("customers")
            .select("id,name,email,phone,segment,tax_id,last_activity_at")
            .order("created_at", { ascending: false })
            .limit(limit);
          if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
          const { data, error } = await q;
          if (error) return { error: error.message };
          return { customers: data ?? [] };
        },
      }),
      list_products: tool({
        description: "Məhsul siyahısı: qiymət, ölçü vahidi, ƏDV dərəcəsi.",
        inputSchema: z.object({
          search: z.string().optional(),
          limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ search, limit }) => {
          let q = supabase.from("products")
            .select("id,name,sku,price,currency,unit,vat_rate,is_active")
            .limit(limit);
          if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
          q = q.order("name", { ascending: true });
          const { data, error } = await q;
          if (error) return { error: error.message };
          return { products: data ?? [] };
        },
      }),
      list_orders: tool({
        description: "Sifariş siyahısı. Status, tarix, məbləğ.",
        inputSchema: z.object({
          status: z.string().optional(),
          limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ status, limit }) => {
          let q = supabase.from("orders")
            .select("id,order_no,order_date,status,total,currency,payment_status,customer:customers(name)")
            .order("order_date", { ascending: false })
            .limit(limit);
          if (status) q = q.eq("status", status);
          const { data, error } = await q;
          if (error) return { error: error.message };
          return { orders: data ?? [] };
        },
      }),
      sales_summary: tool({
        description: "Son N gün üçün satış xülasəsi: dövriyyə, sifariş sayı, orta çek, top müştəri və məhsul.",
        inputSchema: z.object({
          days: z.number().int().min(1).max(365).default(30),
        }),
        execute: async ({ days }) => {
          if (!tenantId) return { error: "Aktiv şirkət yoxdur" };
          const to = new Date();
          const from = new Date();
          from.setDate(from.getDate() - days);
          const iso = (d: Date) => d.toISOString().slice(0, 10);
          const { data, error } = await supabase.rpc("sales_dashboard", {
            _tenant: tenantId,
            _from: iso(from),
            _to: iso(to),
          });
          if (error) return { error: error.message };
          return { summary: data };
        },
      }),
      count_records: tool({
        description: "Cədvəldə qeyd sayı (customers, products, orders, quotes, employees).",
        inputSchema: z.object({
          table: z.enum(["customers", "products", "orders", "quotes", "employees", "projects"]),
        }),
        execute: async ({ table }) => {
          const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
          if (error) return { error: error.message };
          return { table, count: count ?? 0 };
        },
      }),
    };

    const system = `Sən ExERP sisteminin AI köməkçisisən. İstifadəçi şirkət daxilində sual verir.
Cavabları AZƏRBAYCAN dilində, qısa və dəqiq ver. Rəqəmləri ₼ (manat) formatında göstər.
Data lazım olduqda tools çağır. Sistemdə şirkət təcridi RLS ilə təmin edilir — nəticələr avtomatik cari şirkətə aiddir.
Nə cavab verə biləcəyin: müştəri/məhsul/sifariş axtarışı, statistika, az qalan məhsullar, satış xülasəsi.`;

    const result = streamText({
      model: gateway("google/gemini-3.6-flash"),
      system,
      messages: await convertToModelMessages(Array.isArray(messages) ? messages : []),
      tools,
      stopWhen: stepCountIs(8),
    });

    return result.toUIMessageStreamResponse({ headers: corsHeaders });
  } catch (e) {
    console.error("erp-chat error", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
