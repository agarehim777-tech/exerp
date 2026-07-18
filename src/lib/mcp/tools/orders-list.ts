import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "./_supabase";

export default defineTool({
  name: "orders_list",
  title: "List orders",
  description: "List the signed-in user's orders (most recent first).",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return."),
    status: z.string().optional().describe("Optional status filter (e.g. pending, paid)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    let q = supabaseForUser(ctx)
      .from("orders")
      .select("id, customer_name, total_amount, status, notes, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
