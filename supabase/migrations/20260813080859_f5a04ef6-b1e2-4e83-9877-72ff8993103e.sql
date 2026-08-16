REVOKE EXECUTE ON FUNCTION public.audit_procurement_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_grn_header_landed_cost_trigger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_grn_landed_cost_trigger() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_credit_contract(uuid, text, uuid, uuid, numeric, numeric, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_contract(uuid, text, uuid, uuid, numeric, numeric, integer, date) TO authenticated;