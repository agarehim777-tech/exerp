import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import whoamiTool from "./tools/whoami";
import ordersListTool from "./tools/orders-list";
import ordersGetTool from "./tools/orders-get";
import projectsListTool from "./tools/projects-list";
import projectsGetTool from "./tools/projects-get";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "erpaz-mcp",
  title: "ERPAZ Operations MCP",
  version: "0.2.0",
  instructions:
    "Tools for the ERPAZ operations suite. Use `echo` to verify connectivity, `whoami` for the signed-in user, `orders_list`/`orders_get` for orders, and `projects_list`/`projects_get` for projects. All data is scoped to the OAuth user via RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, whoamiTool, ordersListTool, ordersGetTool, projectsListTool, projectsGetTool],
});
