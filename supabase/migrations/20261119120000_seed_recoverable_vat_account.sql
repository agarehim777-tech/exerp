-- Seed the recoverable VAT account 1400 "Əvəzləşdirilən ƏDV" (ports drizzle/migrations/0000_recoverable_vat_account.sql).
--
-- Paying a taxed vendor invoice needs an asset account for recoverable VAT; the payment dialog offers asset
-- accounts other than cash/bank/receivables/inventory and preselects 1400. The repo's ensure_inventory_accounts
-- never created 1400, and the browser cannot call it (EXECUTE is revoked from authenticated), so on a tenant without
-- 1400 the dialog showed "Uyğun ƏDV aktiv hesabı tapılmadı" and payment stayed blocked.
--
-- 1. ensure_inventory_accounts seeds 1400 with the other default accounts (same body as 20261001134507 plus 1400).
-- 2. Every existing tenant gets 1400.
-- 3. New tenants get 1400 when they are created (create_tenant does not seed a chart of accounts).

CREATE OR REPLACE FUNCTION public.ensure_inventory_accounts(_tenant uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

-- Internal helper for server commands only, as before.
REVOKE ALL ON FUNCTION public.ensure_inventory_accounts(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.seed_tenant_recoverable_vat_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.chart_of_accounts(tenant_id, code, name, type)
  VALUES (NEW.id, '1400', 'Əvəzləşdirilən ƏDV', 'asset')
  ON CONFLICT (tenant_id, code) DO NOTHING;
  RETURN NEW;
END $function$;

REVOKE ALL ON FUNCTION private.seed_tenant_recoverable_vat_account() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tenants_seed_recoverable_vat_account ON public.tenants;
CREATE TRIGGER tenants_seed_recoverable_vat_account
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION private.seed_tenant_recoverable_vat_account();

INSERT INTO public.chart_of_accounts(tenant_id, code, name, type)
SELECT t.id, '1400', 'Əvəzləşdirilən ƏDV', 'asset'
FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;
