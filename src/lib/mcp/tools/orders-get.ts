import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "./_supabase";

export default defineTool({
  name: "orders_get",
  title: "Get order",
  description: "Get a single order owned by the signed-in user, by id.",
  inputSchema: { id: z.string().uuid().describe("Order id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const { data, error } = await supabaseForUser(ctx)
      .from("orders")
      .select("id, order_no, customer_id, total, status, notes, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Not found" }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { order: data },
    };
  },
});
