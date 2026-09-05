CREATE OR REPLACE FUNCTION public.create_manual_journal_entry(
  _tenant uuid, _entry_date date, _reference text, _description text, _lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE entry_id uuid; debit_total numeric; credit_total numeric;
BEGIN
  IF NOT private.has_module_access(_tenant, 'accounting', 'edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN RAISE EXCEPTION 'Ən azı iki jurnal sətri tələb olunur'; END IF;
  SELECT COALESCE(sum((line->>'debit')::numeric),0), COALESCE(sum((line->>'credit')::numeric),0)
    INTO debit_total, credit_total FROM jsonb_array_elements(_lines) line;
  IF debit_total <= 0 OR abs(debit_total-credit_total) > 0.009 THEN RAISE EXCEPTION 'Jurnal balanslı deyil'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) line LEFT JOIN public.chart_of_accounts a ON a.id=(line->>'account_id')::uuid AND a.tenant_id=_tenant WHERE a.id IS NULL) THEN
    RAISE EXCEPTION 'Jurnal hesabı şirkətə aid deyil';
  END IF;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,created_by)
  VALUES(_tenant,_entry_date,nullif(trim(_reference),''),nullif(trim(_description),''),'manual',auth.uid()) RETURNING id INTO entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
  SELECT entry_id,(line->>'account_id')::uuid,COALESCE((line->>'debit')::numeric,0),COALESCE((line->>'credit')::numeric,0),nullif(line->>'memo',''),ordinality
  FROM jsonb_array_elements(_lines) WITH ORDINALITY AS rows(line,ordinality);
  RETURN entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.post_manual_journal_entry(_entry uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE row public.journal_entries%rowtype;
BEGIN
  SELECT * INTO row FROM public.journal_entries WHERE id=_entry FOR UPDATE;
  IF row.id IS NULL OR NOT private.has_module_access(row.tenant_id,'accounting','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF row.posted THEN RETURN; END IF;
  UPDATE public.journal_entries SET posted=true,updated_at=now() WHERE id=row.id;
END $$;

CREATE OR REPLACE FUNCTION public.reverse_journal_entry(_entry uuid,_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE original public.journal_entries%rowtype; reversal uuid;
BEGIN
  SELECT * INTO original FROM public.journal_entries WHERE id=_entry FOR UPDATE;
  IF original.id IS NULL OR NOT private.has_module_access(original.tenant_id,'accounting','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF NOT original.posted THEN RAISE EXCEPTION 'Yalnız post edilmiş jurnal əks yazılışla ləğv edilir'; END IF;
  IF length(trim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'Ləğv səbəbini daxil edin'; END IF;
  SELECT id INTO reversal FROM public.journal_entries WHERE source_type='journal_reversal' AND source_id=original.id LIMIT 1;
  IF reversal IS NOT NULL THEN RETURN reversal; END IF;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
  VALUES(original.tenant_id,current_date,coalesce(original.reference,original.id::text)||'-R','Əks yazılış: '||trim(_reason),'journal_reversal',original.id,auth.uid()) RETURNING id INTO reversal;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
  SELECT reversal,account_id,credit,debit,'Əks: '||coalesce(memo,''),line_no FROM public.journal_lines WHERE entry_id=original.id ORDER BY line_no;
  UPDATE public.journal_entries SET posted=true WHERE id=reversal;
  RETURN reversal;
END $$;

CREATE OR REPLACE FUNCTION public.protect_posted_journal() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.posted THEN RAISE EXCEPTION 'Post edilmiş jurnal dəyişdirilə və silinə bilməz; əks yazılış yaradın'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_posted_journal ON public.journal_entries;
CREATE TRIGGER trg_protect_posted_journal BEFORE UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.protect_posted_journal();

CREATE OR REPLACE FUNCTION public.protect_posted_journal_lines() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE target uuid := CASE WHEN TG_OP='DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
BEGIN
  IF EXISTS(SELECT 1 FROM public.journal_entries WHERE id=target AND posted) THEN RAISE EXCEPTION 'Post edilmiş jurnal sətirləri dəyişdirilə bilməz'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_posted_journal_lines ON public.journal_lines;
CREATE TRIGGER trg_protect_posted_journal_lines BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.protect_posted_journal_lines();

CREATE OR REPLACE FUNCTION public.customer_sales_metrics(_tenant uuid)
RETURNS TABLE(customer_id uuid, paid_total numeric, sales_total numeric, order_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.customer_id,COALESCE(sum(o.paid_amount),0),COALESCE(sum(o.total),0),count(*)
  FROM public.orders o WHERE o.tenant_id=_tenant AND o.customer_id IS NOT NULL AND o.status::text<>'cancelled'
    AND public.is_tenant_member(_tenant,auth.uid()) GROUP BY o.customer_id
$$;

REVOKE ALL ON FUNCTION public.create_manual_journal_entry(uuid,date,text,text,jsonb), public.post_manual_journal_entry(uuid), public.reverse_journal_entry(uuid,text), public.customer_sales_metrics(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_manual_journal_entry(uuid,date,text,text,jsonb), public.post_manual_journal_entry(uuid), public.reverse_journal_entry(uuid,text), public.customer_sales_metrics(uuid) TO authenticated,service_role;

