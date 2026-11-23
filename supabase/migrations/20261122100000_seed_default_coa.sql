-- Mühasibat → "Standart hesablar" calls seed_default_coa(_tenant), but no migration ever created the
-- function (older migrations only granted it when it happened to exist), so the button always failed.
-- It adds the standard chart: the accounts the server commands post to (ensure_inventory_accounts) plus
-- equity and operating-expense accounts. Existing codes are left as they are.
-- Same rule as the chart_of_accounts write policy: tenant admins only.
CREATE OR REPLACE FUNCTION public.seed_default_coa(_tenant uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_count integer; after_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(_tenant IN (SELECT private.admin_tenant_ids()), false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  SELECT count(*) INTO before_count FROM public.chart_of_accounts WHERE tenant_id=_tenant;
  PERFORM public.ensure_inventory_accounts(_tenant);
  INSERT INTO public.chart_of_accounts(tenant_id,code,name,type) VALUES
    (_tenant,'3000','Nizamnamə kapitalı','equity'),
    (_tenant,'3400','Bölüşdürülməmiş mənfəət','equity'),
    (_tenant,'6000','Ümumi və inzibati xərclər','expense'),
    (_tenant,'6100','Əmək haqqı xərcləri','expense'),
    (_tenant,'6200','İcarə və kommunal xərclər','expense')
    ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT count(*) INTO after_count FROM public.chart_of_accounts WHERE tenant_id=_tenant;
  RETURN after_count-before_count;
END $$;
REVOKE ALL ON FUNCTION public.seed_default_coa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_coa(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
