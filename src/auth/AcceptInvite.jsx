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
    <div className="u-max-width-480px u-margin-80px_auto u-padding-24px u-background-surface u-border-radius-12px u-text-align-center u-box-shadow-0_8px_32px_rgba_0_0_0_0_08">
      <h2>Şirkət dəvəti</h2>
      {status === "checking" && <p>Yoxlanılır…</p>}
      {status === "ok" && <p className="u-color-text_primary">✓ Dəvət qəbul edildi. Yönləndirilirsiniz…</p>}
      {status === "error" && <p className="u-color-b23a3a">✗ {msg}</p>}
    </div>
  );
}
