import { supabase } from "../integrations/supabase/client";

export const MAIN_CASH_NAME = "Əsas kassa";

export function mainCashCode(tenantId) {
  return `MAIN-${String(tenantId).slice(0, 8).toUpperCase()}`;
}

/**
 * Tenant üçün əsas kassa hesabını tapır; yoxdursa yaradır, deaktivdirsə aktivləşdirir.
 * Ödəniş, kredit və beh əməliyyatlarının hamısı bu köməkçidən istifadə edir.
 */
export async function ensureMainCashAccount(tenantId, currency = "AZN") {
  if (!tenantId) throw new Error("tenantId tələb olunur");
  currency = String(currency || 'AZN').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Valyuta kodu düzgün deyil.');
  const code = mainCashCode(tenantId);

  const { data: byCode, error: byCodeError } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("account_no", code)
    .eq("currency", currency)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (byCodeError) throw byCodeError;
  if (byCode) return byCode;

  const { data: byName, error: byNameError } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", MAIN_CASH_NAME)
    .eq("currency", currency)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (byNameError) throw byNameError;
  if (byName) return byName;

  const { data: inactive, error: inactiveError } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("account_no", code)
    .eq("currency", currency)
    .maybeSingle();
  if (inactiveError) throw inactiveError;
  if (inactive) {
    const { data: reactivated, error: reactivateError } = await supabase
      .from("cash_accounts")
      .update({ is_active: true, name: MAIN_CASH_NAME, type: "cash", currency })
      .eq("id", inactive.id)
      .eq("tenant_id", tenantId)
      .select("id")
      .single();
    if (reactivateError) throw reactivateError;
    return reactivated;
  }

  const { data: created, error: createError } = await supabase
    .from("cash_accounts")
    .insert({
      tenant_id: tenantId,
      code: `${code}-${currency}`,
      account_no: code,
      name: MAIN_CASH_NAME,
      type: "cash",
      currency,
      opening_balance: 0,
      is_active: true,
    })
    .select("id")
    .single();
  if (createError?.code === '23505') {
    const retry = await supabase.from('cash_accounts').select('id')
      .eq('tenant_id', tenantId).eq('account_no', code).eq('currency', currency)
      .eq('is_active', true).limit(1).maybeSingle();
    if (retry.error) throw retry.error;
    if (retry.data) return retry.data;
  }
  if (createError) throw createError;
  return created;
}
