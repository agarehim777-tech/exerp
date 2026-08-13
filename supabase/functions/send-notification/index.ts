import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod";

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

const BodySchema = z.object({
  tenantId: z.string().uuid(),
  channel: z.enum(["telegram", "whatsapp"]),
  recipient: z.string().min(1).max(120),
  body: z.string().min(1).max(3000),
  templateCode: z.string().max(60).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().uuid().optional(),
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

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

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const input = parsed.data;

    // Növbəyə yaz (RLS: yalnız öz şirkəti üçün)
    const { data: delivery, error: insertError } = await supabase
      .from("notification_deliveries")
      .insert({
        tenant_id: input.tenantId,
        channel: input.channel,
        provider: input.channel === "telegram" ? "telegram-bot" : "wa.me",
        recipient: input.recipient,
        body: input.body,
        template_code: input.templateCode ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        status: input.channel === "whatsapp" ? "sent" : "sending",
        attempts: 1,
        sent_at: input.channel === "whatsapp" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (insertError) return json({ error: insertError.message }, 400);

    // WhatsApp: click-to-chat linki qaytarılır, operator özü göndərir.
    if (input.channel === "whatsapp") {
      const phone = input.recipient.replace(/[^0-9]/g, "");
      return json({
        id: delivery.id,
        status: "sent",
        link: `https://wa.me/${phone}?text=${encodeURIComponent(input.body)}`,
      });
    }

    // Telegram: connector gateway vasitəsilə bot mesajı
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const telegramKey = Deno.env.get("TELEGRAM_API_KEY");
    if (!lovableKey || !telegramKey) {
      await supabase.from("notification_deliveries")
        .update({ status: "failed", last_error: "Telegram bağlantısı konfiqurasiya olunmayıb" })
        .eq("id", delivery.id);
      return json({
        id: delivery.id,
        status: "failed",
        error: "Telegram bağlantısı qurulmayıb. Parametrlərdən Telegram konnektorunu qoşun.",
      }, 400);
    }

    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: input.recipient, text: input.body, parse_mode: "HTML" }),
    });

    const payload = await response.text();
    if (!response.ok) {
      console.error(`telegram sendMessage failed [${response.status}]: ${payload}`);
      await supabase.from("notification_deliveries")
        .update({ status: "failed", last_error: payload.slice(0, 500) })
        .eq("id", delivery.id);
      return json({ id: delivery.id, status: "failed", providerStatus: response.status, details: payload }, response.status);
    }

    const result = JSON.parse(payload);
    if (result?.ok === false) {
      await supabase.from("notification_deliveries")
        .update({ status: "failed", last_error: String(result?.description || "Telegram xətası") })
        .eq("id", delivery.id);
      return json({ id: delivery.id, status: "failed", details: result?.description }, 400);
    }

    await supabase.from("notification_deliveries")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: String(result?.result?.message_id ?? ""),
      })
      .eq("id", delivery.id);

    return json({ id: delivery.id, status: "sent", messageId: result?.result?.message_id ?? null });
  } catch (error) {
    console.error("send-notification error", error);
    return json({ error: String((error as Error)?.message || error) }, 500);
  }
});
