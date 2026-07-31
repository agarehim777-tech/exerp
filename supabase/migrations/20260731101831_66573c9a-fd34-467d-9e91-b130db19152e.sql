REVOKE ALL ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_period_lock_journal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_period_lock_invoice() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_accounting_period() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_audit_log() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_period_lock_journal() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_period_lock_invoice() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_accounting_period() TO service_role;