import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import whoamiTool from "./tools/whoami";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "erpaz-mcp",
  title: "ERPAZ Operations MCP",
  version: "0.1.0",
  instructions:
    "Tools for the ERPAZ operations suite. Use `echo` to verify connectivity, and `whoami` to confirm the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, whoamiTool],
});
