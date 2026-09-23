import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "npm:ai";
import { z } from "npm:zod";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible";
import { canReadTenant, isTenantId, tenantSelect } from "./tenant-data.js";

function createOpenAiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return json({ error: "Sessiya bitib. Yenidən daxil olun." }, 401);
    }

    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) {
      return json({
        error: "AI köməkçisi hələ konfiqurasiya edilməyib.",
        code: "AI_PROVIDER_NOT_CONFIGURED",
      }, 503);
    }

    const { messages, tenantId }: { messages: UIMessage[]; tenantId?: string } = await req.json();
    if (!isTenantId(tenantId)) return json({ error: "Aktiv şirkət seçilməyib.", code: "TENANT_REQUIRED" }, 400);
    if (!await canReadTenant(supabase, tenantId, userRes.user.id)) {
      return json({ error: "Bu şirkətə giriş icazəniz yoxdur.", code: "TENANT_FORBIDDEN" }, 403);
    }

    // Strip PostgREST filter metacharacters so AI-supplied text cannot alter
    // the filter expression (only literal search text remains).
    const sanitizeSearch = (value: string) =>
      value.replace(/[,()."'\\*%:]/g, " ").trim().slice(0, 80);

    const gateway = createOpenAiProvider(key);

    const tools = {
      list_customers: tool({
        description: "Aktiv tenant üçün müştəri siyahısını qaytarır. Ad, e-poçt, telefon, seqment.",
        inputSchema: z.object({
          search: z.string().optional().describe("Ad və ya e-poçt üzrə axtarış"),
          limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ search, limit }) => {
          let q = tenantSelect(supabase, tenantId, "customers", "id,name,email,phone,segment,tax_id,last_activity_at")
            .order("created_at", { ascending: false })
            .limit(limit);
          if (search) q = q.or(`name.ilike.%${sanitizeSearch(search)}%,email.ilike.%${sanitizeSearch(search)}%`);
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
          let q = tenantSelect(supabase, tenantId, "products", "id,name,sku,price,currency,unit,vat_rate,is_active")
            .limit(limit);
          if (search) q = q.or(`name.ilike.%${sanitizeSearch(search)}%,sku.ilike.%${sanitizeSearch(search)}%`);
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
          let q = tenantSelect(supabase, tenantId, "orders", "id,order_no,order_date,status,total,currency,payment_status,customer:customers(name)")
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
          const { count, error } = await tenantSelect(supabase, tenantId, table, "*", { count: "exact", head: true });
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
      model: gateway("gpt-5-mini"),
      system,
      messages: await convertToModelMessages(Array.isArray(messages) ? messages : []),
      tools,
      stopWhen: stepCountIs(8),
    });

    return result.toUIMessageStreamResponse({
      headers: corsHeaders,
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("erp-chat stream error", message);
        if (/quota|billing|insufficient_quota/i.test(message)) {
          return "OpenAI hesabında API balansı və ya billing aktiv deyil.";
        }
        if (/model|not found|access/i.test(message)) {
          return "Seçilmiş OpenAI modeli bu layihə üçün əlçatan deyil.";
        }
        if (/rate.?limit|429/i.test(message)) {
          return "AI sorğu limiti dolub. Bir qədər sonra yenidən cəhd edin.";
        }
        return "AI xidməti sorğunu tamamlaya bilmədi.";
      },
    });
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
