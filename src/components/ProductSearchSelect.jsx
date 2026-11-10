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
  return <div className="u-position-relative u-min-width-0">
    <Search size={15} className="u-position-absolute u-left-10px u-top-11px u-z-index-2 u-color-82948e u-pointer-events-none" />
    <input disabled={disabled} value={query} placeholder={placeholder} autoComplete="off" onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),120)} onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(0)}} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();setActive(i=>Math.min(i+1,matches.length-1))}if(e.key==="ArrowUp"){e.preventDefault();setActive(i=>Math.max(i-1,0))}if(e.key==="Enter"&&open&&matches[active]){e.preventDefault();pick(matches[active])}if(e.key==="Escape")setOpen(false)}} className={`sx-6d56738 sx-cb7992d sx-4c85e96 sx-0a2864b sx-a50337b sx-59fdaf8 ${disabled ? "sx-4dc743e" : "sx-0695ff9"}`} />
    {open&&!disabled&&<div className="u-position-absolute u-z-index-80 u-top-calc_100_5px u-left-0 u-right-0 u-max-height-280px u-overflow-y-auto u-padding-5px u-border-1px_solid_d5dfdc u-border-radius-9px u-background-surface u-box-shadow-0_12px_30px_rgba_21_55_45_16">{matches.length?matches.map((item,index)=><button key={item.id} type="button" aria-label={`${item.name} ${renderMeta?.(item) || item.sku || "SKU yoxdur"}`} onMouseDown={event=>event.preventDefault()} onClick={()=>pick(item)} className={`sx-6d56738 sx-f7dbba7 sx-daae847 sx-114b3e2 sx-7b4323b sx-012333e sx-9aae82e ${index===active ? "sx-c40454d" : "sx-1eb2246"} sx-b202c6d sx-200a92a`}><b>{item.name}</b><small className="u-color-71867f">{renderMeta?.(item) || item.sku || "SKU yoxdur"}</small></button>):<div className="u-padding-12px u-text-align-center u-color-71867f">Uyğun məhsul tapılmadı</div>}</div>}
  </div>;
}
