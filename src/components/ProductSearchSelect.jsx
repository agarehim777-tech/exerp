import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const norm = (value) => String(value || "").trim().toLocaleLowerCase("az-AZ");

export default function ProductSearchSelect({ products = [], value = "", onChange, placeholder = "Məhsul adı və ya SKU yazın", disabled = false, renderMeta }) {
  const selected = products.find((item) => String(item.id) === String(value));
  const [query, setQuery] = useState(selected?.name || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => setQuery(selected?.name || ""), [selected?.id, selected?.name]);
  const matches = useMemo(() => {
    const term = norm(query);
    return products.filter((item) => !term || norm(`${item.name} ${item.sku}`).includes(term)).sort((a, b) => {
      const ax = norm(a.name).startsWith(term) || norm(a.sku).startsWith(term);
      const bx = norm(b.name).startsWith(term) || norm(b.sku).startsWith(term);
      return Number(bx) - Number(ax) || String(a.name).localeCompare(String(b.name), "az");
    }).slice(0, 10);
  }, [products, query]);
  const pick = (item) => { setQuery(item.name); setOpen(false); setActive(0); onChange?.(item.id, item); };
  return <div style={{ position:"relative", minWidth:0 }}>
    <Search size={15} style={{ position:"absolute", left:10, top:11, zIndex:2, color:"#82948e", pointerEvents:"none" }} />
    <input disabled={disabled} value={query} placeholder={placeholder} autoComplete="off" onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),120)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0)}} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();setActive(i=>Math.min(i+1,matches.length-1))}if(e.key==="ArrowUp"){e.preventDefault();setActive(i=>Math.max(i-1,0))}if(e.key==="Enter"&&open&&matches[active]){e.preventDefault();pick(matches[active])}if(e.key==="Escape")setOpen(false)}} style={{width:"100%",height:38,boxSizing:"border-box",border:"1px solid #d5dfdc",borderRadius:8,padding:"0 10px 0 32px",background:disabled?"#f2f4f3":"#fff"}} />
    {open&&!disabled&&<div style={{position:"absolute",zIndex:80,top:"calc(100% + 5px)",left:0,right:0,maxHeight:280,overflowY:"auto",padding:5,border:"1px solid #d5dfdc",borderRadius:9,background:"#fff",boxShadow:"0 12px 30px rgba(21,55,45,.16)"}}>{matches.length?matches.map((item,index)=><button key={item.id} type="button" onMouseDown={()=>pick(item)} style={{width:"100%",display:"flex",justifyContent:"space-between",gap:10,padding:"9px",border:0,borderRadius:6,background:index===active?"#e8f5ef":"transparent",cursor:"pointer",textAlign:"left"}}><b>{item.name}</b><small style={{color:"#71867f"}}>{renderMeta?.(item) || item.sku || "SKU yoxdur"}</small></button>):<div style={{padding:12,textAlign:"center",color:"#71867f"}}>Uyğun məhsul tapılmadı</div>}</div>}
  </div>;
}
