import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "./AuthProvider.jsx";

export default function AcceptInvite() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const token = sp.get("token");
  const { user, loading } = useAuth();
  const [status, setStatus] = useState("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { nav(`/login?next=/accept-invite?token=${token}`); return; }
    if (!token) { setStatus("error"); setMsg("Token yoxdur"); return; }
    (async () => {
      const { data, error } = await supabase.rpc("accept_tenant_invite", { _token: token });
      if (error) { setStatus("error"); setMsg(error.message); }
      else {
        setStatus("ok");
        await supabase.from("profiles").update({ active_tenant_id: data }).eq("id", user.id);
        setTimeout(() => nav("/"), 1500);
      }
    })();
  }, [user, loading, token, nav]);

  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, background: "#fff", borderRadius: 12, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
      <h2>Şirkət dəvəti</h2>
      {status === "checking" && <p>Yoxlanılır…</p>}
      {status === "ok" && <p style={{ color: "#064e3b" }}>✓ Dəvət qəbul edildi. Yönləndirilirsiniz…</p>}
      {status === "error" && <p style={{ color: "#b23a3a" }}>✗ {msg}</p>}
    </div>
  );
}
