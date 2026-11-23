import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useTenantRequestScope } from "./useTenantRequestScope";

export function useChartOfAccounts() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const { begin } = useTenantRequestScope(tenantId);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { setAccounts([]); }, [tenantId]);
  const reload = useCallback(async () => {
    if (!tenantId) { setAccounts([]); setError(null); setLoading(false); return; }
    const isCurrent = begin();
    setLoading(true);
    const { data, error: readError } = await supabase.from("chart_of_accounts")
      .select("*").eq("tenant_id", tenantId).order("code");
    if (!isCurrent()) return;
    setError(readError || null);
    setAccounts(data || []);
    setLoading(false);
  }, [tenantId, begin]);

  useEffect(() => { reload(); }, [reload]);

  const seedDefaults = async () => {
    if (!tenantId) return;
    const { error } = await supabase.rpc("seed_default_coa", { _tenant: tenantId });
    if (error) throw error;
    await reload();
  };

  const create = async (payload) => {
    const { error } = await supabase.from("chart_of_accounts")
      .insert({ ...payload, tenant_id: tenantId });
    if (error) throw error;
    await reload();
  };

  const update = async (id, patch) => {
    const { error } = await supabase.from("chart_of_accounts").update(patch).eq("id", id);
    if (error) throw error;
    await reload();
  };

  const remove = async (id) => {
    const { error } = await supabase.from("chart_of_accounts").delete().eq("id", id);
    if (error) throw error;
    await reload();
  };

  return { accounts, loading, error, reload, seedDefaults, create, update, remove };
}

const JOURNAL_PAGE_SIZE = 200;

export function useJournalEntries() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const { begin } = useTenantRequestScope(tenantId);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(JOURNAL_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => { setEntries([]); setLimit(JOURNAL_PAGE_SIZE); setHasMore(false); }, [tenantId]);
  // Newest first, one page at a time: the list used to stop at 200 entries without saying so.
  const reload = useCallback(async () => {
    if (!tenantId) { setEntries([]); setError(null); setLoading(false); return; }
    const isCurrent = begin();
    setLoading(true);
    const { data, error: readError } = await supabase.from("journal_entries")
      .select("*, journal_lines(*, chart_of_accounts(code, name, type))")
      .eq("tenant_id", tenantId)
      .order("entry_date", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    if (!isCurrent()) return;
    setError(readError || null);
    if (!readError) {
      setHasMore((data || []).length > limit);
      setEntries((data || []).slice(0, limit));
    }
    setLoading(false);
  }, [tenantId, begin, limit]);
  const loadMore = useCallback(() => setLimit((current) => current + JOURNAL_PAGE_SIZE), []);

  useEffect(() => { reload(); }, [reload]);

  const createEntry = async ({ entry_date, reference, description, lines }) => {
    const { data: id, error } = await supabase.rpc("create_manual_journal_entry", {
      _tenant: tenantId, _entry_date: entry_date, _reference: reference,
      _description: description, _lines: lines,
    });
    if (error) throw error;
    await reload();
    return { id };
  };

  const post = async (id) => {
    const { error } = await supabase.rpc("post_manual_journal_entry", { _entry: id });
    if (error) throw error;
    await reload();
  };

  const remove = async (id) => {
    const { error } = await supabase.from("journal_entries").delete().eq("id", id).eq("posted", false);
    if (error) throw error;
    await reload();
  };

  const reverse = async (id, reason) => {
    const { error } = await supabase.rpc("reverse_journal_entry", { _entry: id, _reason: reason });
    if (error) throw error;
    await reload();
  };

  return { entries, loading, error, reload, createEntry, post, remove, reverse, hasMore, loadMore };
}

export async function fetchTrialBalance(tenantId, from, to) {
  const { data, error } = await supabase.rpc("trial_balance", { _tenant: tenantId, _from: from, _to: to });
  if (error) throw error;
  return data || [];
}

