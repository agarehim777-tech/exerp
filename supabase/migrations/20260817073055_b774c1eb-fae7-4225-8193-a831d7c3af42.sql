GRANT EXECUTE ON FUNCTION public.generate_doc_number(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_invoice_to_gl(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment_to_gl(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_invoice_match(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_coa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_crm_pipeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_bootstrap_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.backfill_sales_bonus_for_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_sales_bonus_for_order(uuid) TO authenticated;