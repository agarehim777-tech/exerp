import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, supabaseForUser } from "./_supabase";

export default defineTool({
  name: "projects_list",
  title: "List projects",
  description: "List the signed-in user's projects (most recent first).",
  inputSchema: {
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return."),
    status: z.string().optional().describe("Optional status filter (e.g. active, done)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    let q = supabaseForUser(ctx)
      .from("projects")
      .select("id, name, description, status, budget, start_date, end_date, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { projects: data ?? [] },
    };
  },
});
