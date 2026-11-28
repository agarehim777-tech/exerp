import { supabase } from '../integrations/supabase/client';

// Opening balances (customers, vendors, cash/bank accounts, active credits) in one all-or-nothing server
// command; a repeated submit with the same request key returns the first result.
/**
 * @returns {Promise<{ kind: string, row_count: number, created: number, skipped: number }>}
 */
export async function importOpeningBalances(tenantId, kind, rows, requestKey) {
  if (!tenantId || !kind || !requestKey || !Array.isArray(rows) || !rows.length) throw new Error('İdxal məlumatları natamamdır.');
  const { data, error } = await supabase.rpc('import_opening_balances', {
    _tenant_id: tenantId, _kind: kind, _request_key: requestKey, _rows: rows,
  });
  if (error) throw new Error(describeOpeningImportError(error));
  const result = /** @type {{ kind: string, row_count: number, created: number, skipped: number } | null} */ (/** @type {unknown} */ (data));
  if (result?.row_count !== rows.length) throw new Error('İdxalın server təsdiqi alınmadı.');
  return result;
}

const reasonLabels = {
  'name required': 'ad boşdur',
  'FIN invalid': 'FİN düzgün deyil (5-10 hərf/rəqəm)',
  'FIN repeated in file': 'FİN faylda təkrarlanır',
  'VOEN repeated in file': 'VÖEN faylda təkrarlanır',
  'vendor repeated in file': 'təchizatçı faylda təkrarlanır',
  'code required': 'kod boşdur',
  'type must be cash or bank': 'növ "kassa" və ya "bank" olmalıdır',
  'currency invalid': 'valyuta kodu düzgün deyil',
  'code repeated in file': 'kod faylda təkrarlanır',
  'account code already exists': 'bu kodla hesab artıq var',
  'contract number required': 'müqavilə nömrəsi boşdur',
  'contract repeated in file': 'müqavilə faylda təkrarlanır',
  'contract already exists': 'bu nömrəli müqavilə artıq var',
  'customer FIN or VOEN required': 'müştərinin FİN və ya VÖEN-i lazımdır',
  'customer not found (import customers first)': 'müştəri tapılmadı (əvvəlcə müştəriləri idxal edin)',
  'financed amount must be more than zero': 'kreditə verilən məbləğ sıfırdan böyük olmalıdır',
  'term must be 1-120 months': 'müddət 1-120 ay olmalıdır',
  'first due date invalid': 'ilk ödəniş tarixi düzgün deyil',
  'term or first due date invalid': 'müddət və ya ilk ödəniş tarixi düzgün deyil',
  'credit already fully paid; do not import': 'kredit tam ödənilib, idxal etməyin',
};

export function describeOpeningImportError(error) {
  const message = String(error?.message || error || '');
  const match = /opening_import_invalid: line (\d+): (.+)$/.exec(message);
  if (match) {
    const [, line, reason] = match;
    const label = reasonLabels[reason]
      || reason.replace(/ is not a number$/, ' rəqəm deyil').replace(/ must be zero or more$/, ' mənfi ola bilməz').replace(/ required$/, ' boşdur');
    return `Sətir ${line}: ${label}.`;
  }
  if (message.includes('permission_denied')) return 'Bu idxal üçün icazəniz yoxdur.';
  if (message.includes('idempotency_key_payload_mismatch')) return 'Fayl dəyişib. Yenidən yükləyin.';
  return message || 'İdxal alınmadı.';
}
