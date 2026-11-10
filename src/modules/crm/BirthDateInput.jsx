import React, { useEffect, useState } from 'react';
import { Select } from "../../shared/ui/primitives.tsx";

export default function BirthDateInput({ value, onChange }) {
  const initial = String(value || '').split('-');
  const [year, setYear] = useState(initial[0] || '');
  const [month, setMonth] = useState(initial[1] || '');
  const [day, setDay] = useState(initial[2] || '');
  useEffect(() => {
    const parts = String(value || '').split('-');
    if (value) { setYear(parts[0] || ''); setMonth(parts[1] || ''); setDay(parts[2] || ''); }
  }, [value]);
  const setPart = (part, next) => {
    const parts = { day, month, year, [part]: next };
    if (part === 'day') setDay(next);
    if (part === 'month') setMonth(next);
    if (part === 'year') setYear(next);
    onChange(parts.day && parts.month && parts.year ? `${parts.year}-${parts.month}-${parts.day}` : '');
  };
  const currentYear = new Date().getFullYear();
  return <div className="u-display-grid u-grid-template-columns-0_8fr_1_2fr_1fr u-gap-8px u-margin-top-4px">
    <Select aria-label="Gün" value={day} onChange={e => setPart('day', e.target.value)} className="birth-date-input-select-style">
      <option value="">Gün</option>{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(v => <option key={v} value={v}>{Number(v)}</option>)}
    </Select>
    <Select aria-label="Ay" value={month} onChange={e => setPart('month', e.target.value)} className="birth-date-input-select-style">
      <option value="">Ay</option>{['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'].map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
    </Select>
    <Select aria-label="İl" value={year} onChange={e => setPart('year', e.target.value)} className="birth-date-input-select-style">
      <option value="">İl</option>{Array.from({ length: 110 }, (_, i) => String(currentYear - i)).map(v => <option key={v} value={v}>{v}</option>)}
    </Select>
  </div>;
}
