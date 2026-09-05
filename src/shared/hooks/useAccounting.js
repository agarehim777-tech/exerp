import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";

export function useChartOfAccounts() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tenantId) { setAccounts([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("chart_of_accounts")
      .select("*").eq("tenant_id", tenantId).order("code");
    setAccounts(data || []);
    setLoading(false);
  }, [tenantId]);

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

  return { accounts, loading, reload, seedDefaults, create, update, remove };
}

export function useJournalEntries() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tenantId) { setEntries([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("journal_entries")
      .select("*, journal_lines(*, chart_of_accounts(code, name, type))")
      .eq("tenant_id", tenantId)
      .order("entry_date", { ascending: false }).limit(200);
    setEntries(data || []);
    setLoading(false);
  }, [tenantId]);

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

  return { entries, loading, reload, createEntry, post, remove, reverse };
}

export async function fetchTrialBalance(tenantId, from, to) {
  const { data, error } = await supabase.rpc("trial_balance", { _tenant: tenantId, _from: from, _to: to });
  if (error) throw error;
  return data || [];
}

