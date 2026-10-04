CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  name text NOT NULL DEFAULT 'ERP HTTP audit', key_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,name)
);
CREATE TABLE private.webhook_signing_keys (
  endpoint_id uuid PRIMARY KEY REFERENCES public.webhook_endpoints(id), secret text NOT NULL
);
REVOKE ALL ON private.webhook_signing_keys FROM PUBLIC,anon,authenticated;
CREATE TABLE public.webhook_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id), request_key text NOT NULL,
  payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','delivered','failed')),
  attempts integer NOT NULL DEFAULT 0, attempt_id uuid, lease_until timestamptz,
  response_code integer, latency_ms integer, error_code text, created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, UNIQUE(tenant_id,request_key)
);
CREATE TABLE public.webhook_receipts (
  dispatch_id uuid PRIMARY KEY REFERENCES public.webhook_dispatches(id), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  payload_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.webhook_signing_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_read ON public.webhook_endpoints FOR SELECT TO authenticated USING(coalesce(private.has_module_access(tenant_id,'api','view'),false));
CREATE POLICY webhook_dispatches_read ON public.webhook_dispatches FOR SELECT TO authenticated USING(coalesce(private.has_module_access(tenant_id,'api','view'),false));
CREATE POLICY webhook_receipts_read ON public.webhook_receipts FOR SELECT TO authenticated USING(coalesce(private.has_module_access(tenant_id,'api','view'),false));
GRANT SELECT ON public.webhook_endpoints,public.webhook_dispatches,public.webhook_receipts TO authenticated;
GRANT ALL ON public.webhook_endpoints,public.webhook_dispatches,public.webhook_receipts,private.webhook_signing_keys TO service_role;
REVOKE ALL ON public.webhook_endpoints,public.webhook_dispatches,public.webhook_receipts FROM anon;
CREATE INDEX webhook_dispatches_tenant_time_idx ON public.webhook_dispatches(tenant_id,created_at);
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_dispatches FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_receipts FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();

CREATE FUNCTION public.prepare_webhook_audit(_tenant_id uuid,_request_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE endpoint uuid; dispatch uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'api','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  INSERT INTO public.webhook_endpoints(tenant_id) VALUES(_tenant_id) ON CONFLICT(tenant_id,name) DO NOTHING;
  SELECT id INTO endpoint FROM public.webhook_endpoints WHERE tenant_id=_tenant_id AND name='ERP HTTP audit';
  INSERT INTO private.webhook_signing_keys(endpoint_id,secret) VALUES(endpoint,gen_random_uuid()::text||gen_random_uuid()::text) ON CONFLICT DO NOTHING;
  INSERT INTO public.webhook_dispatches(tenant_id,endpoint_id,request_key,payload,created_by)
    VALUES(_tenant_id,endpoint,_request_key,jsonb_build_object('event','erp.connection.audit','tenant_id',_tenant_id),auth.uid()) ON CONFLICT DO NOTHING;
  SELECT id INTO dispatch FROM public.webhook_dispatches WHERE tenant_id=_tenant_id AND request_key=_request_key AND created_by=auth.uid();
  IF dispatch IS NULL THEN RAISE EXCEPTION 'request_key_owner_mismatch'; END IF;
  RETURN jsonb_build_object('dispatch_id',dispatch,'endpoint_id',endpoint);
END $$;
CREATE FUNCTION public.rotate_webhook_audit_key(_tenant_id uuid,_endpoint_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'api','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  UPDATE public.webhook_endpoints SET key_version=key_version+1 WHERE tenant_id=_tenant_id AND id=_endpoint_id RETURNING key_version INTO version;
  IF version IS NULL THEN RAISE EXCEPTION 'endpoint_not_found'; END IF;
  UPDATE private.webhook_signing_keys SET secret=gen_random_uuid()::text||gen_random_uuid()::text WHERE endpoint_id=_endpoint_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'api','signing_key_rotated','Webhook signing key rotated',jsonb_build_object('endpoint_id',_endpoint_id,'version',version));
  RETURN version;
END $$;
CREATE FUNCTION public.claim_webhook_audit(_dispatch_id uuid,_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.webhook_dispatches%rowtype; secret_value text; token uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO item FROM public.webhook_dispatches WHERE id=_dispatch_id AND created_by=_actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dispatch_not_found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_members m JOIN public.role_permissions p ON p.role=m.role
    WHERE m.tenant_id=item.tenant_id AND m.user_id=_actor_id AND p.module='api' AND p.can_edit AND m.role<>'viewer')
    OR (EXISTS(SELECT 1 FROM public.tenant_modules WHERE tenant_id=item.tenant_id)
      AND NOT EXISTS(SELECT 1 FROM public.tenant_modules WHERE tenant_id=item.tenant_id AND module='api')) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF item.status='delivered' THEN RETURN jsonb_build_object('delivered',true,'dispatch_id',item.id); END IF;
  IF item.status='processing' AND item.lease_until>now() THEN RAISE EXCEPTION 'dispatch_in_progress'; END IF;
  IF item.attempts>=5 THEN RAISE EXCEPTION 'dispatch_retry_limit'; END IF;
  UPDATE public.webhook_dispatches SET status='processing',attempts=attempts+1,attempt_id=token,lease_until=now()+interval '60 seconds' WHERE id=item.id;
  SELECT secret INTO secret_value FROM private.webhook_signing_keys WHERE endpoint_id=item.endpoint_id;
  RETURN jsonb_build_object('dispatch_id',item.id,'attempt_id',token,'tenant_id',item.tenant_id,'secret',secret_value,
    'payload',item.payload||jsonb_build_object('dispatch_id',item.id,'created_at',item.created_at));
END $$;
CREATE FUNCTION public.webhook_audit_receipt_context(_dispatch_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('tenant_id',d.tenant_id,'secret',k.secret) FROM public.webhook_dispatches d
    JOIN private.webhook_signing_keys k ON k.endpoint_id=d.endpoint_id WHERE d.id=_dispatch_id;
$$;
CREATE FUNCTION public.record_webhook_audit_receipt(_dispatch_id uuid,_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tenant uuid; existing_hash text;
BEGIN
  SELECT tenant_id INTO tenant FROM public.webhook_dispatches WHERE id=_dispatch_id;
  IF tenant IS NULL THEN RAISE EXCEPTION 'dispatch_not_found'; END IF;
  INSERT INTO public.webhook_receipts(dispatch_id,tenant_id,payload_hash) VALUES(_dispatch_id,tenant,_hash) ON CONFLICT DO NOTHING;
  SELECT payload_hash INTO existing_hash FROM public.webhook_receipts WHERE dispatch_id=_dispatch_id;
  IF existing_hash<>_hash THEN RAISE EXCEPTION 'receipt_payload_mismatch'; END IF;
  RETURN true;
END $$;
CREATE FUNCTION public.finish_webhook_audit(_dispatch_id uuid,_attempt_id uuid,_code integer,_latency integer,_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.webhook_dispatches%rowtype; success boolean;
BEGIN
  SELECT * INTO item FROM public.webhook_dispatches WHERE id=_dispatch_id AND attempt_id=_attempt_id AND status='processing' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dispatch_lease_mismatch'; END IF;
  success:=_code BETWEEN 200 AND 299 AND EXISTS(SELECT 1 FROM public.webhook_receipts WHERE dispatch_id=item.id);
  UPDATE public.webhook_dispatches SET status=CASE WHEN success THEN 'delivered' ELSE 'failed' END,response_code=_code,
    latency_ms=greatest(_latency,0),error_code=CASE WHEN success THEN NULL ELSE coalesce(_error,'receipt_missing') END,completed_at=now(),lease_until=NULL WHERE id=item.id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,item.tenant_id,item.created_by,'api','http_dispatch_finished','Signed HTTP webhook audit',jsonb_build_object('dispatch_id',item.id,'delivered',success,'response_code',_code));
  RETURN jsonb_build_object('dispatch_id',item.id,'delivered',success,'response_code',_code,'latency_ms',greatest(_latency,0));
END $$;
REVOKE ALL ON FUNCTION public.prepare_webhook_audit(uuid,text),public.rotate_webhook_audit_key(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_webhook_audit(uuid,text),public.rotate_webhook_audit_key(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_webhook_audit(uuid,uuid),public.webhook_audit_receipt_context(uuid),public.record_webhook_audit_receipt(uuid,text),public.finish_webhook_audit(uuid,uuid,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_audit(uuid,uuid),public.webhook_audit_receipt_context(uuid),public.record_webhook_audit_receipt(uuid,text),public.finish_webhook_audit(uuid,uuid,integer,integer,text) TO service_role;
