
REVOKE EXECUTE ON FUNCTION public.generate_doc_number(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_order(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sales_dashboard(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_doc_number(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_dashboard(UUID, DATE, DATE) TO authenticated;
