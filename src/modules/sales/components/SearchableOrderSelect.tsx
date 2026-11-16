// Satış formasında axtarışlı seçim (combobox): yazdıqca süzür, ilk 50 nəticəni göstərir, Enter ilk nəticəni seçir, Esc bağlayır.
import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "../../../shared/ui/primitives.tsx";
import type { SearchOption } from "../services/salesOrderForm.ts";
import { foldSearchText } from "../../../shared/lib/searchText.ts";

export function SearchableOrderSelect({ value, options, onChange, placeholder, ariaLabel, disabled = false }: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const selected = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selected?.label || "");
  const [open, setOpen] = useState(false);
  const normalizedQuery = foldSearchText(query.trim());
  const visibleOptions = (normalizedQuery
    ? options.filter((option) => foldSearchText(`${option.label} ${option.searchText || ""}`).includes(normalizedQuery))
    : options).slice(0, 50);

  useEffect(() => {
    setQuery(selected?.label || "");
  }, [value, selected?.label]);

  const choose = (option: SearchOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <div className={`order-search-select ${disabled ? "disabled" : ""}`}>
      <Search size={16} aria-hidden="true" />
      <Input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && open && visibleOptions[0]) {
            event.preventDefault();
            choose(visibleOptions[0]);
          }
          if (event.key === "Escape") { setOpen(false); setQuery(selected?.label || ""); }
        }}
      />
      {open && !disabled && <div className="order-search-select-menu" role="listbox">
        {visibleOptions.length ? visibleOptions.map((option) => (
          <button type="button" role="option" aria-selected={option.value === value} key={option.value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
            <span><strong>{option.label}</strong>{option.subtitle && <small>{option.subtitle}</small>}</span>
            {option.value === value && <Check size={15} />}
          </button>
        )) : <div className="order-search-select-empty">Uyğun nəticə tapılmadı</div>}
        {options.length > 50 && !normalizedQuery && <div className="order-search-select-hint">Nəticələri azaltmaq üçün yazmağa başlayın</div>}
      </div>}
    </div>
  );
}
