CREATE OR REPLACE FUNCTION public.ensure_inventory_accounts(_tenant uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_tenant_member(_tenant, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
 END IF;
 INSERT INTO public.chart_of_accounts(tenant_id,code,name,type) VALUES
  (_tenant,'1000','Kassa','asset'),(_tenant,'1010','Bank hesabı','asset'),(_tenant,'1200','Debitor borcları','asset'),
  (_tenant,'1400','Əvəzləşdirilən ƏDV','asset'),
  (_tenant,'2050','Mal ehtiyatları','asset'),(_tenant,'2100','ƏDV öhdəliyi','liability'),(_tenant,'2200','Təchizatçı borcları','liability'),
  (_tenant,'2300','Müştəri avansları və geri ödənişlər','liability'),(_tenant,'4000','Satış gəliri','revenue'),
  (_tenant,'5000','Satılmış məhsulun maya dəyəri','expense') ON CONFLICT(tenant_id,code) DO NOTHING;
 INSERT INTO public.inventory_accounting_settings(tenant_id) VALUES(_tenant) ON CONFLICT DO NOTHING;
END $function$;

INSERT INTO public.chart_of_accounts(tenant_id,code,name,type)
SELECT t.id,'1400','Əvəzləşdirilən ƏDV','asset' FROM public.tenants t
ON CONFLICT (tenant_id,code) DO NOTHING;