import React, { useEffect, useState } from 'react';

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
  const selectStyle = { minWidth: 0, width: '100%', height: 38, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', padding: '0 8px', fontSize: 14 };
  const currentYear = new Date().getFullYear();
  return <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1fr', gap: 8, marginTop: 4 }}>
    <select aria-label="Gün" value={day} onChange={e => setPart('day', e.target.value)} style={selectStyle}>
      <option value="">Gün</option>{Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map(v => <option key={v} value={v}>{Number(v)}</option>)}
    </select>
    <select aria-label="Ay" value={month} onChange={e => setPart('month', e.target.value)} style={selectStyle}>
      <option value="">Ay</option>{['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'].map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}
    </select>
    <select aria-label="İl" value={year} onChange={e => setPart('year', e.target.value)} style={selectStyle}>
      <option value="">İl</option>{Array.from({ length: 110 }, (_, i) => String(currentYear - i)).map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  </div>;
}
