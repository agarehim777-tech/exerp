import React from 'react';

const MAP = {
  // quote
  draft:     { bg: '#e2e8f0', fg: '#475569', label: 'Layihə' },
  sent:      { bg: '#dbeafe', fg: '#1d4ed8', label: 'Göndərilib' },
  accepted:  { bg: '#dcfce7', fg: '#15803d', label: 'Qəbul edildi' },
  rejected:  { bg: '#fee2e2', fg: '#b91c1c', label: 'Rədd edildi' },
  expired:   { bg: '#fef3c7', fg: '#92400e', label: 'Vaxtı bitib' },
  // order
  pending:    { bg: '#fef3c7', fg: '#92400e', label: 'Gözləyir' },
  confirmed:  { bg: '#dbeafe', fg: '#1d4ed8', label: 'Təsdiq' },
  processing: { bg: '#e0e7ff', fg: '#3730a3', label: 'İşlənir' },
  shipped:    { bg: '#ccfbf1', fg: '#0f766e', label: 'Göndərildi' },
  delivered:  { bg: '#dcfce7', fg: '#15803d', label: 'Çatdırıldı' },
  cancelled:  { bg: '#fee2e2', fg: '#b91c1c', label: 'Ləğv' },
  // payment
  unpaid:  { bg: '#fee2e2', fg: '#b91c1c', label: 'Ödənilməyib' },
  partial: { bg: '#fef3c7', fg: '#92400e', label: 'Qismən' },
  paid:    { bg: '#dcfce7', fg: '#15803d', label: 'Ödənilib' },
  // ship
  packed: { bg: '#e0e7ff', fg: '#3730a3', label: 'Yığılıb' },
};

export default function StatusBadge({ status, size = 'sm' }) {
  const s = MAP[status] || { bg: '#e2e8f0', fg: '#475569', label: status || '—' };
  return (
    <span className={`${size === 'sm' ? "sx-1e18ab4" : "sx-6ab3aa8"} sx-1eb7905 ${size === 'sm' ? "sx-8b68521" : "sx-3044b60"} sx-e634e6d sx-6a19fc1 sx-4ddbe90`} style={{ background: s.bg, color: s.fg }}>{s.label}</span>
  );
}
