import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { azn, badge, card, input, table, td, th } from "../../shared/ui/tokens.js";

export default function StockAgingPanel({ tenantId }) {
  const [rows,setRows]=useState([]); const [bucket,setBucket]=useState("Hamısı"); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  useEffect(()=>{let active=true;(async()=>{setLoading(true);const {data,error:nextError}=await supabase.from("inventory_aging_v").select("*").eq("tenant_id",tenantId).order("age_days",{ascending:false});if(active){setRows(data||[]);setError(nextError?.message||"");setLoading(false)}})();return()=>{active=false}},[tenantId]);
  const visible=useMemo(()=>bucket==="Hamısı"?rows:rows.filter(row=>row.aging_bucket===bucket),[rows,bucket]);
  const slow=rows.filter(row=>Number(row.age_days)>90); const slowValue=slow.reduce((sum,row)=>sum+Number(row.stock_value||0),0);
  return <div style={card}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><h3 style={{margin:0}}>Stok yaşlandırması</h3><p style={{margin:"4px 0 0",color:"#64748b"}}>FIFO maya layları üzrə yavaş hərəkət edən mallar</p></div><select value={bucket} onChange={event=>setBucket(event.target.value)} style={{...input,width:180}}>{["Hamısı","0-30","31-90","91-180","180+"].map(item=><option key={item}>{item}</option>)}</select></div>
    <div style={{display:"flex",gap:10,margin:"14px 0",flexWrap:"wrap"}}><span style={badge(slow.length?"red":"green")}>{slow.length} yavaş məhsul</span><b>{azn(slowValue)} riskli stok dəyəri</b></div>{error&&<div style={{color:"#b91c1c"}}>Migration tətbiq edilməlidir: {error}</div>}
    <div style={{overflowX:"auto"}}><table style={table}><thead><tr><th style={th}>Məhsul</th><th style={th}>SKU</th><th style={th}>Yaş</th><th style={th}>Qalıq</th><th style={th}>Vahid maya</th><th style={th}>Dəyər</th><th style={th}>Status</th></tr></thead><tbody>{visible.map(row=><tr key={`${row.product_id}-${row.warehouse_id}-${row.received_at}`}><td style={td}><b>{row.product_name}</b></td><td style={td}>{row.sku||"—"}</td><td style={td}>{row.age_days} gün</td><td style={td}>{Number(row.remaining_qty).toLocaleString("az-AZ")}</td><td style={td}>{azn(row.unit_cost)}</td><td style={td}>{azn(row.stock_value)}</td><td style={td}><span style={badge(Number(row.age_days)>180?"red":Number(row.age_days)>90?"yellow":"green")}>{Number(row.age_days)>180?"Donmuş":Number(row.age_days)>90?"Yavaş":"Normal"}</span></td></tr>)}{!visible.length&&<tr><td style={td} colSpan={7}>{loading?"Yüklənir…":"Yaşlandırma məlumatı yoxdur."}</td></tr>}</tbody></table></div>
  </div>;
}
