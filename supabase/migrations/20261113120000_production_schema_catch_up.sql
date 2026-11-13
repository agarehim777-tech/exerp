-- Production schema catch-up.
--
-- Production (tcqdhwtnjrwpfdxoijmv) recorded only 98 of the repo's migrations and lacked objects the
-- app calls: manual journal entries, tenant invites, credit restructure/adjustment decisions, safe
-- sales order delete, vendor invoice payment with tax, webhook audit, plus the triggers, policies,
-- indexes and columns around them. A catalog diff (2026-11-13) showed production as a strict subset
-- of the repo schema, so this file creates exactly the missing objects from the repo's final
-- definitions (generated from a full migration replay, not retyped).
--
-- Idempotent: every statement is IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS + CREATE,
-- so it is a no-op on a database built from supabase/migrations (CI, restore drill) and safe to
-- re-run. Tested on exerp-staging restored from production on 2026-11-13: applied in one transaction,
-- then the catalog diff against the repo was empty except intentional differences (production keeps
-- its stricter tenant-scoped foreign keys on customer_documents and customer_service_cases).
-- Policies crm_customer_tags_write, crm_tags_write and grnl_tenant_all are dropped because the repo
-- replaced them with split policies (20260822132318, 20260814085808).

-- 1. Columns the repo added to existing tables.
ALTER TABLE public."cash_accounts" ADD COLUMN IF NOT EXISTS "gl_account_id" uuid;
ALTER TABLE public."credit_adjustments" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'approved'::text NOT NULL;
ALTER TABLE public."credit_adjustments" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
ALTER TABLE public."credit_adjustments" ADD COLUMN IF NOT EXISTS "decided_by" uuid;
ALTER TABLE public."credit_adjustments" ADD COLUMN IF NOT EXISTS "decision_note" text;
ALTER TABLE public."credit_adjustments" ADD COLUMN IF NOT EXISTS "requested_amount" numeric(14,2);
ALTER TABLE public."customers" ADD COLUMN IF NOT EXISTS "telegram_chat_id" text;
ALTER TABLE public."delivery_items" ADD COLUMN IF NOT EXISTS "delivered_quantity" numeric(14,3) DEFAULT 0 NOT NULL;
ALTER TABLE public."purchase_order_lines" ADD COLUMN IF NOT EXISTS "qty_received" numeric(14,3) DEFAULT 0 NOT NULL;
ALTER TABLE public."reconciliation_lines" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."workflow_approvals" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE public."workflow_lines" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;

-- 2. Tables the repo created.
CREATE TABLE IF NOT EXISTS public."credit_collection_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "credit_id" uuid NOT NULL,
  "stage" text NOT NULL,
  "outcome" text,
  "next_action_at" timestamp with time zone,
  "note" text,
  "created_by" uuid DEFAULT auth.uid(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."credit_collection_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."credit_collection_events" FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public."credit_collection_events" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."credit_collection_events" TO service_role;
CREATE TABLE IF NOT EXISTS public."po_payments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "po_id" uuid NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "payment_date" date DEFAULT CURRENT_DATE NOT NULL,
  "payment_method" text,
  "reference_no" text,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."po_payments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."po_payments" FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public."po_payments" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."po_payments" TO service_role;
CREATE TABLE IF NOT EXISTS public."vendor_invoice_tax_postings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "tax_account_id" uuid NOT NULL,
  "journal_entry_id" uuid NOT NULL,
  "net_amount" numeric(18,2) NOT NULL,
  "tax_amount" numeric(18,2) NOT NULL,
  "gross_amount" numeric(18,2) NOT NULL,
  "currency" text NOT NULL,
  "tax_treatment" text NOT NULL,
  "posted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);
ALTER TABLE public."vendor_invoice_tax_postings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."vendor_invoice_tax_postings" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."vendor_invoice_tax_postings" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."vendor_invoice_tax_postings" TO service_role;
CREATE TABLE IF NOT EXISTS private."webhook_signing_keys" (
  "endpoint_id" uuid NOT NULL,
  "secret" text NOT NULL
);
ALTER TABLE private."webhook_signing_keys" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private."webhook_signing_keys" FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE private."webhook_signing_keys" TO service_role;
CREATE TABLE IF NOT EXISTS public."webhook_endpoints" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text DEFAULT 'ERP HTTP audit'::text NOT NULL,
  "key_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."webhook_endpoints" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."webhook_endpoints" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."webhook_endpoints" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."webhook_endpoints" TO service_role;
CREATE TABLE IF NOT EXISTS public."webhook_dispatches" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "endpoint_id" uuid NOT NULL,
  "request_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "attempt_id" uuid,
  "lease_until" timestamp with time zone,
  "response_code" integer,
  "latency_ms" integer,
  "error_code" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
ALTER TABLE public."webhook_dispatches" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."webhook_dispatches" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."webhook_dispatches" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."webhook_dispatches" TO service_role;
CREATE TABLE IF NOT EXISTS public."webhook_receipts" (
  "dispatch_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payload_hash" text NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."webhook_receipts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."webhook_receipts" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."webhook_receipts" TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public."webhook_receipts" TO service_role;

-- 3. Constraints (new tables after all of them exist, then new columns).
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_collection_events'::regclass AND conname = 'credit_collection_events_pkey') THEN
    ALTER TABLE public."credit_collection_events" ADD CONSTRAINT "credit_collection_events_pkey" PRIMARY KEY (id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_collection_events'::regclass AND conname = 'credit_collection_events_stage_check') THEN
    ALTER TABLE public."credit_collection_events" ADD CONSTRAINT "credit_collection_events_stage_check" CHECK ((stage = ANY (ARRAY['current'::text, 'reminder'::text, 'call'::text, 'warning'::text, 'soft_collection'::text, 'hard_collection'::text, 'legal'::text, 'restructured'::text, 'closed'::text])));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.po_payments'::regclass AND conname = 'po_payments_pkey') THEN
    ALTER TABLE public."po_payments" ADD CONSTRAINT "po_payments_pkey" PRIMARY KEY (id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.po_payments'::regclass AND conname = 'po_payments_amount_check') THEN
    ALTER TABLE public."po_payments" ADD CONSTRAINT "po_payments_amount_check" CHECK ((amount > (0)::numeric));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_pkey') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_pkey" PRIMARY KEY (id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_invoice_id_key') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_invoice_id_key" UNIQUE (invoice_id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_journal_entry_id_key') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_journal_entry_id_key" UNIQUE (journal_entry_id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_check') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_check" CHECK ((gross_amount = (net_amount + tax_amount)));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_currency_check') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_currency_check" CHECK ((currency = 'AZN'::text));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_net_amount_check') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_net_amount_check" CHECK ((net_amount > (0)::numeric));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_tax_amount_check') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_tax_amount_check" CHECK ((tax_amount > (0)::numeric));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_tax_treatment_check') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_tax_treatment_check" CHECK ((tax_treatment = 'recoverable'::text));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'private.webhook_signing_keys'::regclass AND conname = 'webhook_signing_keys_pkey') THEN
    ALTER TABLE private."webhook_signing_keys" ADD CONSTRAINT "webhook_signing_keys_pkey" PRIMARY KEY (endpoint_id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_endpoints'::regclass AND conname = 'webhook_endpoints_pkey') THEN
    ALTER TABLE public."webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY (id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_endpoints'::regclass AND conname = 'webhook_endpoints_tenant_id_name_key') THEN
    ALTER TABLE public."webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_name_key" UNIQUE (tenant_id, name);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_dispatches'::regclass AND conname = 'webhook_dispatches_pkey') THEN
    ALTER TABLE public."webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_pkey" PRIMARY KEY (id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_dispatches'::regclass AND conname = 'webhook_dispatches_tenant_id_request_key_key') THEN
    ALTER TABLE public."webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_tenant_id_request_key_key" UNIQUE (tenant_id, request_key);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_dispatches'::regclass AND conname = 'webhook_dispatches_status_check') THEN
    ALTER TABLE public."webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'delivered'::text, 'failed'::text])));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_receipts'::regclass AND conname = 'webhook_receipts_pkey') THEN
    ALTER TABLE public."webhook_receipts" ADD CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY (dispatch_id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_collection_events'::regclass AND conname = 'credit_collection_events_created_by_fkey') THEN
    ALTER TABLE public."credit_collection_events" ADD CONSTRAINT "credit_collection_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_collection_events'::regclass AND conname = 'credit_collection_events_credit_id_fkey') THEN
    ALTER TABLE public."credit_collection_events" ADD CONSTRAINT "credit_collection_events_credit_id_fkey" FOREIGN KEY (credit_id) REFERENCES credit_contracts(id) ON DELETE CASCADE;
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_collection_events'::regclass AND conname = 'credit_collection_events_tenant_id_fkey') THEN
    ALTER TABLE public."credit_collection_events" ADD CONSTRAINT "credit_collection_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.po_payments'::regclass AND conname = 'po_payments_created_by_fkey') THEN
    ALTER TABLE public."po_payments" ADD CONSTRAINT "po_payments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.po_payments'::regclass AND conname = 'po_payments_po_id_fkey') THEN
    ALTER TABLE public."po_payments" ADD CONSTRAINT "po_payments_po_id_fkey" FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.po_payments'::regclass AND conname = 'po_payments_tenant_id_fkey') THEN
    ALTER TABLE public."po_payments" ADD CONSTRAINT "po_payments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_created_by_fkey') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_invoice_id_fkey') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES vendor_invoices(id) ON DELETE RESTRICT;
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_journal_entry_id_fkey') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_journal_entry_id_fkey" FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT;
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_tax_account_id_fkey') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_tax_account_id_fkey" FOREIGN KEY (tax_account_id) REFERENCES chart_of_accounts(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.vendor_invoice_tax_postings'::regclass AND conname = 'vendor_invoice_tax_postings_tenant_id_fkey') THEN
    ALTER TABLE public."vendor_invoice_tax_postings" ADD CONSTRAINT "vendor_invoice_tax_postings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'private.webhook_signing_keys'::regclass AND conname = 'webhook_signing_keys_endpoint_id_fkey') THEN
    ALTER TABLE private."webhook_signing_keys" ADD CONSTRAINT "webhook_signing_keys_endpoint_id_fkey" FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_endpoints'::regclass AND conname = 'webhook_endpoints_tenant_id_fkey') THEN
    ALTER TABLE public."webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_dispatches'::regclass AND conname = 'webhook_dispatches_created_by_fkey') THEN
    ALTER TABLE public."webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_dispatches'::regclass AND conname = 'webhook_dispatches_endpoint_id_fkey') THEN
    ALTER TABLE public."webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_endpoint_id_fkey" FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_dispatches'::regclass AND conname = 'webhook_dispatches_tenant_id_fkey') THEN
    ALTER TABLE public."webhook_dispatches" ADD CONSTRAINT "webhook_dispatches_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_receipts'::regclass AND conname = 'webhook_receipts_dispatch_id_fkey') THEN
    ALTER TABLE public."webhook_receipts" ADD CONSTRAINT "webhook_receipts_dispatch_id_fkey" FOREIGN KEY (dispatch_id) REFERENCES webhook_dispatches(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.webhook_receipts'::regclass AND conname = 'webhook_receipts_tenant_id_fkey') THEN
    ALTER TABLE public."webhook_receipts" ADD CONSTRAINT "webhook_receipts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cash_accounts'::regclass AND conname = 'cash_accounts_gl_account_id_fkey') THEN
    ALTER TABLE public."cash_accounts" ADD CONSTRAINT "cash_accounts_gl_account_id_fkey" FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_adjustments'::regclass AND conname = 'credit_adjustments_approval_status_check') THEN
    ALTER TABLE public."credit_adjustments" ADD CONSTRAINT "credit_adjustments_approval_status_check" CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_adjustments'::regclass AND conname = 'credit_adjustments_decided_by_fkey') THEN
    ALTER TABLE public."credit_adjustments" ADD CONSTRAINT "credit_adjustments_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id);
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.credit_adjustments'::regclass AND conname = 'credit_adjustments_requested_amount_check') THEN
    ALTER TABLE public."credit_adjustments" ADD CONSTRAINT "credit_adjustments_requested_amount_check" CHECK (((requested_amount IS NULL) OR (requested_amount > (0)::numeric)));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_items'::regclass AND conname = 'delivery_items_check') THEN
    ALTER TABLE public."delivery_items" ADD CONSTRAINT "delivery_items_check" CHECK (((delivered_quantity >= (0)::numeric) AND (delivered_quantity <= quantity)));
  END IF;
END $c$;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_order_lines'::regclass AND conname = 'purchase_order_lines_qty_received_check') THEN
    ALTER TABLE public."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_qty_received_check" CHECK ((qty_received >= (0)::numeric));
  END IF;
END $c$;

-- 4. Functions (final repo definitions).
CREATE OR REPLACE FUNCTION private.assign_credit_contract_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE next_number numeric;
BEGIN
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_required'; END IF;
  -- Cancelled contracts still own their numbers; allocate inside the sale transaction.
  IF NEW.contract_no ~ '^İN-[0-9]+$' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.tenant_id::text || ':credit-number', 0));
    SELECT greatest(1000, coalesce(max(substring(c.contract_no FROM '^İN-([0-9]+)$')::numeric), 1000)) + 1
      INTO next_number FROM public.credit_contracts c
      WHERE c.tenant_id = NEW.tenant_id AND c.contract_no ~ '^İN-[0-9]+$';
    NEW.contract_no := 'İN-' || next_number::text;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.assign_credit_contract_number() FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION private.capture_daily_erp_reconciliation()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  tenant_row record;
  issues jsonb;
  inserted_count integer := 0;
BEGIN
  FOR tenant_row IN SELECT id FROM public.tenants LOOP
    SELECT coalesce(jsonb_agg(issue ORDER BY issue->>'order_no', issue->>'type'), '[]'::jsonb)
      INTO issues
      FROM (
        SELECT jsonb_build_object('type','active_credit_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(c.id)) issue
          FROM public.orders o JOIN public.credit_contracts c ON c.order_id=o.id AND c.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND c.status::text NOT IN ('cancelled','closed') GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','active_reservation_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(r.id))
          FROM public.orders o JOIN public.stock_reservations r ON r.order_id=o.id AND r.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND r.status::text='active' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','active_delivery_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(d.id))
          FROM public.orders o JOIN public.deliveries d ON d.order_id=o.id AND d.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND d.status::text<>'cancelled' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','active_invoice_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(i.id))
          FROM public.orders o JOIN public.sales_invoices i ON i.order_id=o.id AND i.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND i.status::text<>'cancelled' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','unreversed_cash_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(tx.id))
          FROM public.orders o JOIN public.cash_transactions tx ON tx.tenant_id=o.tenant_id
           AND tx.direction::text='in' AND tx.reversal_of IS NULL
           AND (tx.reference_id=o.id OR tx.reference=o.order_no OR tx.description ILIKE '%'||o.order_no||'%')
           AND NOT EXISTS (SELECT 1 FROM public.cash_transactions reversal WHERE reversal.reversal_of=tx.id)
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','missing_accounting_reversal','order_id',o.id,'order_no',o.order_no,'count',1)
          FROM public.orders o
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled'
           AND EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery')
           AND NOT EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='cancellation')
      ) detected;

    INSERT INTO public.erp_reconciliation_reports(tenant_id, critical_count, report, created_by)
    VALUES (tenant_row.id, jsonb_array_length(issues), issues, NULL);
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$function$;
REVOKE ALL ON FUNCTION private.capture_daily_erp_reconciliation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.capture_daily_erp_reconciliation() TO service_role;
CREATE OR REPLACE FUNCTION private.guard_vendor_tax_posting()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'posted_invoice_tax_is_immutable'; END $function$;
REVOKE ALL ON FUNCTION private.guard_vendor_tax_posting() FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION private.reject_cancelled_order_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE linked_order uuid;
BEGIN
  IF TG_TABLE_NAME = 'credit_contracts' THEN
    linked_order := NEW.order_id;
    IF NEW.status::text IN ('cancelled', 'closed') THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'stock_reservations' THEN
    linked_order := NEW.order_id;
    IF NEW.status::text <> 'active' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'deliveries' THEN
    linked_order := NEW.order_id;
    IF NEW.status::text = 'cancelled' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'cash_transactions' THEN
    IF NEW.direction::text <> 'in' OR NEW.category::text NOT IN ('sales_payment','credit_initial','credit_payment','receivable_payment') THEN RETURN NEW; END IF;
    IF NEW.reference_type::text = 'sales_order' THEN linked_order := NEW.reference_id; END IF;
  END IF;
  IF linked_order IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders WHERE id = linked_order AND tenant_id = NEW.tenant_id AND status::text = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ERP_CANCELLED_ORDER_LINK: ləğv edilmiş sifarişə aktiv əməliyyat bağlana bilməz';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.reject_cancelled_order_child() FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION public.apply_credit_initial_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_order public.orders%rowtype;
  account_id uuid;
  missing_amount numeric;
BEGIN
  IF NEW.order_id IS NULL OR coalesce(NEW.initial_payment,0)<=0 THEN RETURN NEW; END IF;
  SELECT * INTO target_order FROM public.orders
    WHERE id=NEW.order_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_order_not_found'; END IF;
  missing_amount:=round(NEW.initial_payment-coalesce(target_order.paid_amount,0),2);
  IF missing_amount<=0 THEN RETURN NEW; END IF;
  account_id:=private.ensure_main_cash_account(NEW.tenant_id,target_order.currency);
  PERFORM public.register_order_payment(target_order.id,missing_amount,account_id);
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION apply_credit_initial_payment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION apply_credit_initial_payment() TO service_role;
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _delta NUMERIC;
  _wh UUID;
  _prod UUID;
  _tenant UUID;
  _sku TEXT;
  _ref TEXT;
  _reftype TEXT;
BEGIN
  -- canonical_balance_owner: do not double-post command-managed balances.
  IF (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END)
       ? 'movement_type' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    _wh := OLD.warehouse_id; _prod := OLD.product_id; _tenant := OLD.tenant_id; _sku := OLD.sku;
    _ref := OLD.reference; _reftype := OLD.reference_type;
    _delta := CASE WHEN OLD.move_type = 'out' THEN COALESCE(OLD.qty,0) ELSE -COALESCE(OLD.qty,0) END;
  ELSE
    _wh := NEW.warehouse_id; _prod := NEW.product_id; _tenant := NEW.tenant_id; _sku := NEW.sku;
    _ref := NEW.reference; _reftype := NEW.reference_type;
    _delta := CASE WHEN NEW.move_type = 'out' THEN -COALESCE(NEW.qty,0) ELSE COALESCE(NEW.qty,0) END;
  END IF;

  -- Sistem funksiyaları (satış təhvili, ləğv, satınalma qəbulu, rezerv) qalığı
  -- özləri yeniləyir; ikiqat saymamaq üçün onları buraxırıq.
  IF _reftype IS NOT NULL
     OR _ref LIKE 'sales_order:%'
     OR _ref LIKE 'sales_return:%' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF _wh IS NULL OR _prod IS NULL OR _delta = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.stock_balances (tenant_id, warehouse_id, product_id, sku, on_hand, updated_at)
  VALUES (_tenant, _wh, _prod, _sku, _delta, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand, updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE ALL ON FUNCTION apply_stock_movement() FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION public.claim_webhook_audit(_dispatch_id uuid, _actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;
REVOKE ALL ON FUNCTION claim_webhook_audit(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_webhook_audit(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.create_manual_journal_entry(_tenant uuid, _entry_date date, _reference text, _description text, _lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
END $function$;
REVOKE ALL ON FUNCTION create_manual_journal_entry(uuid,date,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_manual_journal_entry(uuid,date,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION create_manual_journal_entry(uuid,date,text,text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_tenant_invite(_tenant uuid, _email text, _role app_role)
 RETURNS TABLE(id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _tok text;
BEGIN
  IF NOT (private.is_tenant_admin(_tenant, auth.uid()) OR private.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.tenant_invites (tenant_id, email, role, invited_by)
  VALUES (_tenant, lower(trim(_email)), _role, auth.uid())
  RETURNING tenant_invites.id, tenant_invites.token INTO _id, _tok;

  RETURN QUERY SELECT _id, _tok;
END;
$function$;
REVOKE ALL ON FUNCTION create_tenant_invite(uuid,text,app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_tenant_invite(uuid,text,app_role) TO authenticated;
CREATE OR REPLACE FUNCTION public.decide_credit_adjustment(_tenant uuid, _adjustment uuid, _decision text, _note text DEFAULT NULL::text)
 RETURNS credit_adjustments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE result public.credit_adjustments%rowtype;
BEGIN
  IF NOT private.has_module_access(_tenant,'credits','edit') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  UPDATE public.credit_adjustments SET approval_status=_decision,decided_by=auth.uid(),decided_at=now(),decision_note=nullif(trim(_note),'')
  WHERE tenant_id=_tenant AND id=_adjustment AND approval_status='pending' RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'adjustment_not_pending'; END IF;
  RETURN result;
END $function$;
REVOKE ALL ON FUNCTION decide_credit_adjustment(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION decide_credit_adjustment(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION decide_credit_adjustment(uuid,uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.delete_sales_order_safe(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  payment_row public.cash_transactions%rowtype;
  cash_account public.cash_accounts%rowtype;
  refund_transaction_id uuid;
  refund_journal_id uuid;
  cash_gl_id uuid;
  advance_gl_id uuid;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Sifariş tapılmadı';
  END IF;
  IF NOT (public.is_tenant_admin(target.tenant_id, auth.uid()) OR target.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Bu sifarişi silmək üçün icazəniz yoxdur';
  END IF;
  IF target.status::text IN ('delivered', 'shipped', 'processing') THEN
    RAISE EXCEPTION 'Anbar və ya təhvil əməliyyatı başlamış sifariş silinə bilməz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_bonus_entries WHERE order_id = target.id AND status <> 'reversed') THEN
    UPDATE public.sales_bonus_entries SET status = 'reversed', reversed_at = now()
     WHERE order_id = target.id AND status <> 'reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.credit_payments payment
    JOIN public.credit_contracts contract ON contract.id = payment.credit_id
    WHERE contract.order_id = target.id
  ) THEN
    RAISE EXCEPTION 'Kredit ödənişi olan sifariş silinə bilməz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_reservations WHERE order_id = target.id AND status = 'fulfilled') THEN
    RAISE EXCEPTION 'Anbardan çıxışı tamamlanmış sifariş silinə bilməz';
  END IF;

  FOR reservation_row IN
    SELECT * FROM public.stock_reservations WHERE order_id = target.id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET reserved = GREATEST(0, COALESCE(reserved, 0) - reservation_row.quantity), updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id;
    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      move_type, qty, reference_type, reference_id, note, created_by
    ) VALUES (
      reservation_row.tenant_id, reservation_row.warehouse_id, reservation_row.product_id,
      'release', -reservation_row.quantity, 'adjust', 0, 'stock_reservation', reservation_row.id,
      target.order_no || ' sifarişi silindi', auth.uid()
    );
  END LOOP;

  IF COALESCE(target.paid_amount, 0) > 0 THEN
    PERFORM public.ensure_inventory_accounts(target.tenant_id);
    FOR payment_row IN
      SELECT * FROM public.cash_transactions
       WHERE tenant_id = target.tenant_id
         AND reference = target.order_no
         AND direction = 'in'
         AND category = 'sales_payment'
       FOR UPDATE
    LOOP
      SELECT * INTO cash_account FROM public.cash_accounts WHERE id = payment_row.account_id FOR UPDATE;
      INSERT INTO public.cash_transactions(
        tenant_id, account_id, direction, amount, currency, category,
        customer_id, reference, description, occurred_at
      ) VALUES (
        target.tenant_id, payment_row.account_id, 'out', payment_row.amount,
        payment_row.currency, 'sales_refund', target.customer_id,
        target.order_no || '-LƏĞV', target.order_no || ' silinmə üzrə ödəniş qaytarılması', current_date
      ) RETURNING id INTO refund_transaction_id;

      cash_gl_id := COALESCE(cash_account.gl_account_id, public.gl_account_by_code(
        target.tenant_id, CASE WHEN cash_account.type::text = 'cash' THEN '1000' ELSE '1010' END
      ));
      advance_gl_id := public.gl_account_by_code(target.tenant_id, '2300');
      INSERT INTO public.journal_entries(
        tenant_id, entry_date, reference, description, source_type, source_id, created_by
      ) VALUES (
        target.tenant_id, current_date, target.order_no || '-LƏĞV',
        'Təhvil verilməmiş sifariş ödənişinin qaytarılması', 'sales_order_refund', refund_transaction_id, auth.uid()
      ) RETURNING id INTO refund_journal_id;
      INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no) VALUES
        (refund_journal_id, advance_gl_id, payment_row.amount, 0, 'Müştəri avansının ləğvi', 1),
        (refund_journal_id, cash_gl_id, 0, payment_row.amount, 'Kassadan geri ödəniş', 2);
      UPDATE public.journal_entries SET posted = true WHERE id = refund_journal_id;
    END LOOP;
    UPDATE public.orders SET paid_amount = 0, payment_status = 'unpaid' WHERE id = target.id;
  END IF;

  DELETE FROM public.sales_bonus_entries WHERE order_id = target.id;
  DELETE FROM public.stock_reservations WHERE order_id = target.id;
  DELETE FROM public.order_bonus_assignments WHERE order_id = target.id;
  DELETE FROM public.credit_contracts WHERE order_id = target.id;
  DELETE FROM public.order_items WHERE order_id = target.id;
  DELETE FROM public.orders WHERE id = target.id;
END;
$function$;
REVOKE ALL ON FUNCTION delete_sales_order_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_sales_order_safe(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.finish_webhook_audit(_dispatch_id uuid, _attempt_id uuid, _code integer, _latency integer, _error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;
REVOKE ALL ON FUNCTION finish_webhook_audit(uuid,uuid,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finish_webhook_audit(uuid,uuid,integer,integer,text) TO service_role;
CREATE OR REPLACE FUNCTION public.get_tenant_invite_token(_invite uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant uuid;
  _tok text;
BEGIN
  SELECT tenant_id, token INTO _tenant, _tok FROM public.tenant_invites WHERE id = _invite;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'not found';
  END IF;
  IF NOT (private.is_tenant_admin(_tenant, auth.uid()) OR private.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN _tok;
END;
$function$;
REVOKE ALL ON FUNCTION get_tenant_invite_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_tenant_invite_token(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.pay_vendor_invoice_with_tax_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE req public.operation_requests%rowtype; inv public.vendor_invoices%rowtype;
  posting public.vendor_invoice_tax_postings%rowtype;
  business_date date := (_payload->>'payment_date')::date;
  net_amount numeric; gross_amount numeric; tax_amount numeric;
  tax_gl uuid; payable_gl uuid; journal_id uuid; result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false)
    OR NOT coalesce(private.has_module_access(_tenant_id,'procurement','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 OR business_date IS NULL THEN RAISE EXCEPTION 'invalid_payment_request'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'pay_vendor_invoice_atomic',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'pay_vendor_invoice_atomic' OR req.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  SELECT * INTO inv FROM public.vendor_invoices WHERE id=(_payload->>'invoice_id')::uuid AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  IF inv.status NOT IN ('matched','approved') THEN RAISE EXCEPTION 'invoice_not_payable'; END IF;
  IF inv.currency<>'AZN' THEN RAISE EXCEPTION 'invoice_fx_posting_required'; END IF;
  PERFORM 1 FROM public.purchase_orders WHERE id=inv.po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_purchase_scope'; END IF;
  PERFORM 1 FROM public.purchase_order_lines WHERE po_id=inv.po_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.vendor_invoice_lines WHERE invoice_id=inv.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.cash_accounts WHERE tenant_id=_tenant_id AND id=(_payload->>'account_id')::uuid AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  SELECT round(sum(qty_invoiced*unit_price),2),round(sum(qty_invoiced*unit_price*(1+tax_rate/100)),2)
    INTO net_amount,gross_amount FROM public.vendor_invoice_lines WHERE invoice_id=inv.id;
  tax_amount:=gross_amount-net_amount;
  IF net_amount IS NULL OR net_amount<=0 OR net_amount::text IN ('NaN','Infinity','-Infinity')
    OR gross_amount IS NULL OR gross_amount<=0 OR gross_amount::text IN ('NaN','Infinity','-Infinity')
    OR tax_amount<0 THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
  IF tax_amount>0 THEN
    IF _payload->>'tax_treatment' IS DISTINCT FROM 'recoverable' THEN RAISE EXCEPTION 'invoice_tax_policy_required'; END IF;
    tax_gl:=(_payload->>'tax_account_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.chart_of_accounts a WHERE a.id=tax_gl AND a.tenant_id=_tenant_id
      AND a.is_active AND a.type::text='asset' AND a.currency=inv.currency
      AND a.code NOT IN ('1000','1010','1200','2050')
      AND NOT EXISTS(SELECT 1 FROM public.cash_accounts c WHERE c.tenant_id=_tenant_id AND c.gl_account_id=a.id)) THEN
      RAISE EXCEPTION 'invalid_invoice_tax_account';
    END IF;
    PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
    PERFORM public.ensure_inventory_accounts(_tenant_id);
    payable_gl:=public.gl_account_by_code(_tenant_id,'2200');
    SELECT * INTO posting FROM public.vendor_invoice_tax_postings WHERE tenant_id=_tenant_id AND invoice_id=inv.id;
    IF FOUND THEN
      IF posting.net_amount<>net_amount OR posting.tax_amount<>tax_amount OR posting.gross_amount<>gross_amount
        OR posting.tax_account_id<>tax_gl THEN RAISE EXCEPTION 'invoice_tax_posting_mismatch'; END IF;
    ELSE
      INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
        VALUES(_tenant_id,business_date,inv.invoice_number,'Recoverable vendor invoice tax','vendor_invoice_tax',inv.id,auth.uid()) RETURNING id INTO journal_id;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
        VALUES(journal_id,tax_gl,tax_amount,0,'Recoverable input tax',1),(journal_id,payable_gl,0,tax_amount,'Vendor tax payable',2);
      UPDATE public.journal_entries SET posted=true WHERE id=journal_id;
      INSERT INTO public.vendor_invoice_tax_postings(tenant_id,invoice_id,tax_account_id,journal_entry_id,net_amount,tax_amount,gross_amount,currency,tax_treatment,created_by)
        VALUES(_tenant_id,inv.id,tax_gl,journal_id,net_amount,tax_amount,gross_amount,inv.currency,'recoverable',auth.uid());
    END IF;
  END IF;
  -- Any receipt, match, cash or period failure also rolls back the tax posting.
  result_payload:=public.pay_vendor_invoice_atomic(_tenant_id,_request_key,_payload);
  RETURN result_payload;
END $function$;
REVOKE ALL ON FUNCTION pay_vendor_invoice_with_tax_atomic(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pay_vendor_invoice_with_tax_atomic(uuid,text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.post_manual_journal_entry(_entry uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE row public.journal_entries%rowtype;
BEGIN
  SELECT * INTO row FROM public.journal_entries WHERE id=_entry FOR UPDATE;
  IF row.id IS NULL OR NOT private.has_module_access(row.tenant_id,'accounting','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF row.posted THEN RETURN; END IF;
  UPDATE public.journal_entries SET posted=true,updated_at=now() WHERE id=row.id;
END $function$;
REVOKE ALL ON FUNCTION post_manual_journal_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION post_manual_journal_entry(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION post_manual_journal_entry(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.prepare_webhook_audit(_tenant_id uuid, _request_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$;
REVOKE ALL ON FUNCTION prepare_webhook_audit(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION prepare_webhook_audit(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.protect_posted_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.posted THEN RAISE EXCEPTION 'Post edilmiş jurnal dəyişdirilə və silinə bilməz; əks yazılış yaradın'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION protect_posted_journal() FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION public.protect_posted_journal_lines()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE target uuid := CASE WHEN TG_OP='DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
BEGIN
  IF EXISTS(SELECT 1 FROM public.journal_entries WHERE id=target AND posted) THEN RAISE EXCEPTION 'Post edilmiş jurnal sətirləri dəyişdirilə bilməz'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION protect_posted_journal_lines() FROM PUBLIC, anon;
CREATE OR REPLACE FUNCTION public.prune_operational_logs()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app int := 0;
  v_audit int := 0;
  v_events int := 0;
BEGIN
  DELETE FROM public.app_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_app = ROW_COUNT;
  DELETE FROM public.audit_logs WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_audit = ROW_COUNT;
  DELETE FROM public.audit_events WHERE occurred_at < now() - interval '365 days';
  GET DIAGNOSTICS v_events = ROW_COUNT;
  RETURN jsonb_build_object('app_logs', v_app, 'audit_logs', v_audit, 'audit_events', v_events);
END;
$function$;
REVOKE ALL ON FUNCTION prune_operational_logs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION prune_operational_logs() TO service_role;
CREATE OR REPLACE FUNCTION public.record_webhook_audit_receipt(_dispatch_id uuid, _hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE tenant uuid; existing_hash text;
BEGIN
  SELECT tenant_id INTO tenant FROM public.webhook_dispatches WHERE id=_dispatch_id;
  IF tenant IS NULL THEN RAISE EXCEPTION 'dispatch_not_found'; END IF;
  INSERT INTO public.webhook_receipts(dispatch_id,tenant_id,payload_hash) VALUES(_dispatch_id,tenant,_hash) ON CONFLICT DO NOTHING;
  SELECT payload_hash INTO existing_hash FROM public.webhook_receipts WHERE dispatch_id=_dispatch_id;
  IF existing_hash<>_hash THEN RAISE EXCEPTION 'receipt_payload_mismatch'; END IF;
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION record_webhook_audit_receipt(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_webhook_audit_receipt(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.restructure_credit_contract(_tenant uuid, _credit uuid, _term integer, _start_date date, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE source public.credit_contracts%rowtype; replacement uuid; balance numeric(14,2); monthly numeric(14,2); last_amount numeric(14,2); i integer;
BEGIN
  IF NOT private.has_module_access(_tenant,'credits','edit') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _term NOT IN(2,3,4,5,6,12,18,24,36,48) THEN RAISE EXCEPTION 'invalid_term'; END IF;
  SELECT * INTO source FROM public.credit_contracts WHERE tenant_id=_tenant AND id=_credit AND status IN('active','overdue') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_restructurable'; END IF;
  SELECT round(greatest(0,coalesce(sum(principal_due-principal_paid),0)),2) INTO balance FROM public.credit_installments WHERE credit_id=source.id;
  IF balance<=0 THEN RAISE EXCEPTION 'credit_has_no_balance'; END IF;
  INSERT INTO public.credit_contracts(tenant_id,contract_no,customer_id,order_id,principal,initial_payment,required_initial,term_months,start_date,status,daily_penalty_rate,collection_stage,created_by)
  VALUES(_tenant,source.contract_no||'-R'||to_char(clock_timestamp(),'YYMMDDHH24MISS'),source.customer_id,source.order_id,balance,0,0,_term,_start_date,'active',source.daily_penalty_rate,'restructured',auth.uid()) RETURNING id INTO replacement;
  monthly:=round(balance/_term,2); last_amount:=balance-monthly*(_term-1);
  FOR i IN 1.._term LOOP INSERT INTO public.credit_installments(tenant_id,credit_id,installment_no,due_date,principal_due,status)
    VALUES(_tenant,replacement,i,(_start_date+(i||' month')::interval)::date,CASE WHEN i=_term THEN last_amount ELSE monthly END,'pending'); END LOOP;
  UPDATE public.credit_contracts SET status='closed',collection_stage='restructured',closed_at=now(),closed_by=auth.uid(),updated_at=now() WHERE id=source.id;
  INSERT INTO public.credit_restructures(tenant_id,source_credit_id,replacement_credit_id,reason,previous_balance,new_term_months,approved_by,created_by)
    VALUES(_tenant,source.id,replacement,_reason,balance,_term,auth.uid(),auth.uid());
  INSERT INTO public.credit_collection_events(tenant_id,credit_id,stage,outcome,note) VALUES(_tenant,source.id,'restructured','Yeni müqavilə: '||replacement,_reason);
  INSERT INTO public.credit_adjustments(tenant_id,credit_id,adjustment_type,old_value,new_value,reason)
    VALUES(_tenant,source.id,'status',jsonb_build_object('status',source.status,'balance',balance),jsonb_build_object('status','closed','replacement_credit_id',replacement),_reason);
  RETURN replacement;
END $function$;
REVOKE ALL ON FUNCTION restructure_credit_contract(uuid,uuid,integer,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION restructure_credit_contract(uuid,uuid,integer,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION restructure_credit_contract(uuid,uuid,integer,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(_entry uuid, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
END $function$;
REVOKE ALL ON FUNCTION reverse_journal_entry(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reverse_journal_entry(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION reverse_journal_entry(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.rotate_webhook_audit_key(_tenant_id uuid, _endpoint_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'api','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  UPDATE public.webhook_endpoints SET key_version=key_version+1 WHERE tenant_id=_tenant_id AND id=_endpoint_id RETURNING key_version INTO version;
  IF version IS NULL THEN RAISE EXCEPTION 'endpoint_not_found'; END IF;
  UPDATE private.webhook_signing_keys SET secret=gen_random_uuid()::text||gen_random_uuid()::text WHERE endpoint_id=_endpoint_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'api','signing_key_rotated','Webhook signing key rotated',jsonb_build_object('endpoint_id',_endpoint_id,'version',version));
  RETURN version;
END $function$;
REVOKE ALL ON FUNCTION rotate_webhook_audit_key(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rotate_webhook_audit_key(uuid,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sync_expense_cash(_tenant_id uuid, _expense_no text, _status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_account uuid;
  v_posting public.cash_transactions%ROWTYPE;
  v_reversal_id uuid;
  v_posted boolean := false;
  v_reversed boolean := false;
  v_balance numeric := 0;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_tenant_member';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE tenant_id = _tenant_id AND expense_no = _expense_no
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found';
  END IF;

  v_account := COALESCE(v_expense.account_id, private.ensure_main_cash_account(_tenant_id, COALESCE(v_expense.currency, 'AZN')));

  SELECT * INTO v_posting FROM public.cash_transactions
   WHERE tenant_id = _tenant_id
     AND reference_type = 'expense'
     AND reference = 'EXPENSE:' || _expense_no
     AND category = 'expense'
   LIMIT 1;

  IF _status IN ('approved', 'accepted') THEN
    IF v_posting.id IS NULL THEN
      INSERT INTO public.cash_transactions (
        tenant_id, account_id, direction, amount, currency, category,
        reference, reference_type, description, occurred_at, created_by
      ) VALUES (
        _tenant_id, v_account, 'out', COALESCE(v_expense.amount, 0),
        COALESCE(v_expense.currency, 'AZN'), 'expense',
        'EXPENSE:' || _expense_no, 'expense',
        COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc'),
        COALESCE(v_expense.expense_date, CURRENT_DATE), auth.uid()
      ) RETURNING * INTO v_posting;
      v_posted := true;
    ELSE
      SELECT id INTO v_reversal_id FROM public.cash_transactions
       WHERE tenant_id = _tenant_id AND reversal_of = v_posting.id LIMIT 1;
      IF v_reversal_id IS NOT NULL THEN
        DELETE FROM public.cash_transactions WHERE id = v_reversal_id;
      END IF;
      UPDATE public.cash_transactions
         SET amount = COALESCE(v_expense.amount, 0),
             account_id = v_account,
             occurred_at = COALESCE(v_expense.expense_date, CURRENT_DATE),
             description = COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc')
       WHERE id = v_posting.id;
      v_posted := true;
    END IF;
    UPDATE public.expenses SET account_id = v_account WHERE id = v_expense.id;
  ELSIF _status IN ('cancelled', 'rejected') THEN
    IF v_posting.id IS NOT NULL THEN
      SELECT id INTO v_reversal_id FROM public.cash_transactions
       WHERE tenant_id = _tenant_id AND reversal_of = v_posting.id LIMIT 1;
      IF v_reversal_id IS NULL THEN
        INSERT INTO public.cash_transactions (
          tenant_id, account_id, direction, amount, currency, category,
          reference, reference_type, reversal_of, description, occurred_at, created_by
        ) VALUES (
          _tenant_id, v_posting.account_id, 'in', v_posting.amount,
          v_posting.currency, 'expense_reversal',
          'EXPENSE-REVERSAL:' || _expense_no, 'expense', v_posting.id,
          COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc') || ' — ləğv edildi',
          CURRENT_DATE, auth.uid()
        );
        v_reversed := true;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
    INTO v_balance
    FROM public.cash_transactions
   WHERE tenant_id = _tenant_id AND account_id = v_account;

  RETURN jsonb_build_object(
    'account_id', v_account,
    'posted', v_posted,
    'reversed', v_reversed,
    'balance', v_balance
  );
END;
$function$;
REVOKE ALL ON FUNCTION sync_expense_cash(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_expense_cash(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.webhook_audit_receipt_context(_dispatch_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('tenant_id',d.tenant_id,'secret',k.secret) FROM public.webhook_dispatches d
    JOIN private.webhook_signing_keys k ON k.endpoint_id=d.endpoint_id WHERE d.id=_dispatch_id;
$function$;
REVOKE ALL ON FUNCTION webhook_audit_receipt_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION webhook_audit_receipt_context(uuid) TO service_role;

-- 5. Views.
CREATE OR REPLACE VIEW public."inventory_aging_v" WITH (security_invoker=true) AS
SELECT l.tenant_id,
    l.warehouse_id,
    l.product_id,
    p.name AS product_name,
    p.sku,
    l.received_at,
    l.remaining_qty,
    l.unit_cost,
    CURRENT_DATE - l.received_at::date AS age_days,
        CASE
            WHEN (CURRENT_DATE - l.received_at::date) <= 30 THEN '0-30'::text
            WHEN (CURRENT_DATE - l.received_at::date) <= 90 THEN '31-90'::text
            WHEN (CURRENT_DATE - l.received_at::date) <= 180 THEN '91-180'::text
            ELSE '180+'::text
        END AS aging_bucket,
    round(l.remaining_qty * l.unit_cost, 2) AS stock_value
   FROM inventory_cost_layers l
     JOIN products p ON p.id = l.product_id
  WHERE l.remaining_qty > 0::numeric;
REVOKE ALL ON TABLE public."inventory_aging_v" FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public."inventory_aging_v" TO authenticated;
GRANT SELECT ON TABLE public."inventory_aging_v" TO service_role;

-- 6. Indexes.
CREATE INDEX IF NOT EXISTS idx_app_logs_tenant_created ON public.app_logs USING btree (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_occurred ON public.audit_events USING btree (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs USING btree (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_accounts_gl_account_idx ON public.cash_accounts USING btree (gl_account_id) WHERE (gl_account_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS cash_transactions_reference_id_idx ON public.cash_transactions USING btree (tenant_id, reference_id);
CREATE INDEX IF NOT EXISTS cash_transactions_reference_idx ON public.cash_transactions USING btree (tenant_id, reference_type, reference_id);
CREATE INDEX IF NOT EXISTS cash_transactions_transaction_no_idx ON public.cash_transactions USING btree (tenant_id, transaction_no);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_reversal_of ON public.cash_transactions USING btree (reversal_of);
CREATE INDEX IF NOT EXISTS chart_of_accounts_parent_id_idx ON public.chart_of_accounts USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_fk_c150f7636009e4c625bf ON public.credit_adjustments USING btree (decided_by);
CREATE INDEX IF NOT EXISTS crm_deals_owner_id_idx ON public.crm_deals USING btree (owner_id);
CREATE INDEX IF NOT EXISTS crm_deals_pipeline_id_idx ON public.crm_deals USING btree (pipeline_id);
CREATE INDEX IF NOT EXISTS crm_deals_tenant_id_idx ON public.crm_deals USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_9ed7131b401412277461 ON public.customer_documents USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_d9575bee648a5a339bf3 ON public.customer_documents USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_0087bcfc829d752d7532 ON public.customer_service_cases USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_2af6b23c8aff7084e186 ON public.customer_service_cases USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_fk_9780d621f632864333ac ON public.customer_service_cases USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_a99fc5600d01d2393c2c ON public.customer_service_cases USING btree (created_by);
CREATE INDEX IF NOT EXISTS customers_created_by_idx ON public.customers USING btree (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_tenant_order_key ON public.deliveries USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_tenant ON public.deliveries USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS employee_events_tenant_date_idx ON public.employee_events USING btree (tenant_id, event_type, start_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_tenant_expense_no_uidx ON public.expenses USING btree (tenant_id, expense_no);
CREATE INDEX IF NOT EXISTS idx_grnl_grn_id ON public.goods_receipt_lines USING btree (grn_id);
CREATE INDEX IF NOT EXISTS goods_receipts_po_id_idx ON public.goods_receipts USING btree (po_id);
CREATE INDEX IF NOT EXISTS goods_receipts_received_by_idx ON public.goods_receipts USING btree (received_by);
CREATE INDEX IF NOT EXISTS idx_fk_6d03577b45ddb779e8cf ON public.inventory_cost_layers USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_8f8395cef61da6dcac1b ON public.inventory_cost_layers USING btree (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date ON public.journal_entries USING btree (tenant_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_entries_created_by_idx ON public.journal_entries USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines USING btree (entry_id);
CREATE INDEX IF NOT EXISTS idx_fk_4aa0c2b992b3a38dc0b4 ON public.order_accounting_events USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_4ca3930ba19bdc1e09c8 ON public.order_accounting_events USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_62c62a2bee817562c31d ON public.order_accounting_events USING btree (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON public.orders USING btree (tenant_id, order_date DESC);
CREATE INDEX IF NOT EXISTS orders_created_by_idx ON public.orders USING btree (created_by);
CREATE INDEX IF NOT EXISTS orders_quote_id_idx ON public.orders USING btree (quote_id);
CREATE INDEX IF NOT EXISTS products_created_by_idx ON public.products USING btree (created_by);
CREATE INDEX IF NOT EXISTS profiles_active_tenant_id_idx ON public.profiles USING btree (active_tenant_id);
CREATE INDEX IF NOT EXISTS purchase_orders_created_by_idx ON public.purchase_orders USING btree (created_by);
CREATE INDEX IF NOT EXISTS purchase_orders_vendor_id_idx ON public.purchase_orders USING btree (vendor_id);
CREATE INDEX IF NOT EXISTS quote_items_product_id_idx ON public.quote_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_26d3eee4e0670f25ae70 ON public.sales_cost_allocations USING btree (cost_layer_id);
CREATE INDEX IF NOT EXISTS idx_fk_2f9ce64608dbcec8fa2e ON public.sales_cost_allocations USING btree (order_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_4b575d30f7397f0484b1 ON public.sales_cost_allocations USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_5a40b1cb049ee5d144d8 ON public.sales_cost_allocations USING btree (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_641c47822b5584bb0cf3 ON public.sales_cost_allocations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_8399aa94fe11ed6efd55 ON public.sales_cost_allocations USING btree (order_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tenant_date ON public.sales_invoices USING btree (tenant_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant_created ON public.stock_movements USING btree (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_reservations_order_idx ON public.stock_reservations USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS stock_reservations_product_idx ON public.stock_reservations USING btree (tenant_id, warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS tenant_invites_invited_by_idx ON public.tenant_invites USING btree (invited_by);
CREATE INDEX IF NOT EXISTS vendor_invoices_created_by_idx ON public.vendor_invoices USING btree (created_by);
CREATE INDEX IF NOT EXISTS vendor_invoices_po_id_idx ON public.vendor_invoices USING btree (po_id);
CREATE INDEX IF NOT EXISTS vendor_invoices_vendor_id_idx ON public.vendor_invoices USING btree (vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_payments_tenant ON public.po_payments USING btree (tenant_id, po_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_po_payments_po ON public.po_payments USING btree (po_id);
CREATE INDEX IF NOT EXISTS credit_collection_events_credit_idx ON public.credit_collection_events USING btree (tenant_id, credit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fk_7bc0094f07be330a2d76 ON public.credit_collection_events USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_7e53e438e22a5deaaf18 ON public.credit_collection_events USING btree (credit_id);
CREATE INDEX IF NOT EXISTS idx_fk_9e50ffe21ab2478261d9 ON public.po_payments USING btree (created_by);
CREATE INDEX IF NOT EXISTS webhook_dispatches_tenant_time_idx ON public.webhook_dispatches USING btree (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS vendor_invoice_tax_postings_tenant_idx ON public.vendor_invoice_tax_postings USING btree (tenant_id, posted_at);
CREATE INDEX IF NOT EXISTS vendor_invoice_tax_postings_account_idx ON public.vendor_invoice_tax_postings USING btree (tax_account_id);

-- 7. Triggers.
DROP TRIGGER IF EXISTS "reject_cancelled_order_cash" ON public."cash_transactions";
CREATE TRIGGER reject_cancelled_order_cash BEFORE INSERT OR UPDATE ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();
DROP TRIGGER IF EXISTS "viewer_write_boundary" ON public."credit_collection_events";
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR DELETE OR UPDATE ON public.credit_collection_events FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
DROP TRIGGER IF EXISTS "assign_credit_contract_number" ON public."credit_contracts";
CREATE TRIGGER assign_credit_contract_number BEFORE INSERT ON public.credit_contracts FOR EACH ROW EXECUTE FUNCTION private.assign_credit_contract_number();
DROP TRIGGER IF EXISTS "credit_contract_initial_payment" ON public."credit_contracts";
CREATE TRIGGER credit_contract_initial_payment AFTER INSERT OR UPDATE OF initial_payment ON public.credit_contracts FOR EACH ROW WHEN (((new.order_id IS NOT NULL) AND (new.initial_payment > (0)::numeric))) EXECUTE FUNCTION apply_credit_initial_payment();
DROP TRIGGER IF EXISTS "reject_cancelled_order_credit" ON public."credit_contracts";
CREATE TRIGGER reject_cancelled_order_credit BEFORE INSERT OR UPDATE ON public.credit_contracts FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();
DROP TRIGGER IF EXISTS "reject_cancelled_order_delivery" ON public."deliveries";
CREATE TRIGGER reject_cancelled_order_delivery BEFORE INSERT OR UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();
DROP TRIGGER IF EXISTS "trg_deliveries_updated" ON public."deliveries";
CREATE TRIGGER trg_deliveries_updated BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS "trg_protect_posted_journal" ON public."journal_entries";
CREATE TRIGGER trg_protect_posted_journal BEFORE DELETE OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION protect_posted_journal();
DROP TRIGGER IF EXISTS "trg_protect_posted_journal_lines" ON public."journal_lines";
CREATE TRIGGER trg_protect_posted_journal_lines BEFORE INSERT OR DELETE OR UPDATE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION protect_posted_journal_lines();
DROP TRIGGER IF EXISTS "trg_enforce_cancelled_order_module_links" ON public."orders";
CREATE TRIGGER trg_enforce_cancelled_order_module_links BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION enforce_cancelled_order_module_links();
DROP TRIGGER IF EXISTS "trg_po_payments_updated" ON public."po_payments";
CREATE TRIGGER trg_po_payments_updated BEFORE UPDATE ON public.po_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS "viewer_write_boundary" ON public."po_payments";
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR DELETE OR UPDATE ON public.po_payments FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
DROP TRIGGER IF EXISTS "trg_apply_stock_movement" ON public."stock_movements";
CREATE TRIGGER trg_apply_stock_movement AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION apply_stock_movement();
DROP TRIGGER IF EXISTS "reject_cancelled_order_reservation" ON public."stock_reservations";
CREATE TRIGGER reject_cancelled_order_reservation BEFORE INSERT OR UPDATE ON public.stock_reservations FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();
DROP TRIGGER IF EXISTS "vendor_tax_posting_immutable" ON public."vendor_invoice_tax_postings";
CREATE TRIGGER vendor_tax_posting_immutable BEFORE DELETE OR UPDATE ON public.vendor_invoice_tax_postings FOR EACH ROW EXECUTE FUNCTION private.guard_vendor_tax_posting();
DROP TRIGGER IF EXISTS "viewer_write_boundary" ON public."webhook_dispatches";
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR DELETE OR UPDATE ON public.webhook_dispatches FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
DROP TRIGGER IF EXISTS "viewer_write_boundary" ON public."webhook_endpoints";
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR DELETE OR UPDATE ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
DROP TRIGGER IF EXISTS "viewer_write_boundary" ON public."webhook_receipts";
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR DELETE OR UPDATE ON public.webhook_receipts FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();

-- 8. Row level security policies.
DROP POLICY IF EXISTS "credit_collection_events_tenant" ON public."credit_collection_events";
CREATE POLICY "credit_collection_events_tenant" ON public."credit_collection_events" AS PERMISSIVE FOR ALL TO authenticated USING (private.is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid))) WITH CHECK (private.is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "crm_customer_tags_delete" ON public."crm_customer_tags";
CREATE POLICY "crm_customer_tags_delete" ON public."crm_customer_tags" AS PERMISSIVE FOR DELETE TO authenticated USING (private.is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "crm_customer_tags_insert" ON public."crm_customer_tags";
CREATE POLICY "crm_customer_tags_insert" ON public."crm_customer_tags" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((private.is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM crm_tags t
  WHERE ((t.id = crm_customer_tags.tag_id) AND (t.tenant_id = crm_customer_tags.tenant_id)))) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = crm_customer_tags.customer_id) AND (c.tenant_id = crm_customer_tags.tenant_id))))));
DROP POLICY IF EXISTS "crm_tags_admin_write" ON public."crm_tags";
CREATE POLICY "crm_tags_admin_write" ON public."crm_tags" AS PERMISSIVE FOR ALL TO authenticated USING (private.is_tenant_admin(tenant_id, ( SELECT auth.uid() AS uid))) WITH CHECK (private.is_tenant_admin(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "Tenant admins delete deliveries" ON public."deliveries";
CREATE POLICY "Tenant admins delete deliveries" ON public."deliveries" AS PERMISSIVE FOR DELETE TO authenticated USING (is_tenant_admin(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "Tenant members read deliveries" ON public."deliveries";
CREATE POLICY "Tenant members read deliveries" ON public."deliveries" AS PERMISSIVE FOR SELECT TO authenticated USING (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "Tenant members update deliveries" ON public."deliveries";
CREATE POLICY "Tenant members update deliveries" ON public."deliveries" AS PERMISSIVE FOR UPDATE TO authenticated USING (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid))) WITH CHECK (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "Tenant members write deliveries" ON public."deliveries";
CREATE POLICY "Tenant members write deliveries" ON public."deliveries" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "erp_reconciliation_reports_insert" ON public."erp_reconciliation_reports";
CREATE POLICY "erp_reconciliation_reports_insert" ON public."erp_reconciliation_reports" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (private.is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "grnl_tenant_delete" ON public."goods_receipt_lines";
CREATE POLICY "grnl_tenant_delete" ON public."goods_receipt_lines" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND private.is_tenant_member(g.tenant_id, ( SELECT auth.uid() AS uid))))));
DROP POLICY IF EXISTS "grnl_tenant_insert" ON public."goods_receipt_lines";
CREATE POLICY "grnl_tenant_insert" ON public."goods_receipt_lines" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND private.is_tenant_member(g.tenant_id, ( SELECT auth.uid() AS uid))))) AND ((po_line_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ((purchase_order_lines pol
     JOIN purchase_orders po ON ((po.id = pol.po_id)))
     JOIN goods_receipts g2 ON ((g2.id = goods_receipt_lines.grn_id)))
  WHERE ((pol.id = goods_receipt_lines.po_line_id) AND (po.tenant_id = g2.tenant_id)))))));
DROP POLICY IF EXISTS "grnl_tenant_update" ON public."goods_receipt_lines";
CREATE POLICY "grnl_tenant_update" ON public."goods_receipt_lines" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND private.is_tenant_member(g.tenant_id, ( SELECT auth.uid() AS uid)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND private.is_tenant_member(g.tenant_id, ( SELECT auth.uid() AS uid))))) AND ((po_line_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ((purchase_order_lines pol
     JOIN purchase_orders po ON ((po.id = pol.po_id)))
     JOIN goods_receipts g2 ON ((g2.id = goods_receipt_lines.grn_id)))
  WHERE ((pol.id = goods_receipt_lines.po_line_id) AND (po.tenant_id = g2.tenant_id)))))));
DROP POLICY IF EXISTS "po_payments_tenant_all" ON public."po_payments";
CREATE POLICY "po_payments_tenant_all" ON public."po_payments" AS PERMISSIVE FOR ALL TO authenticated USING (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid))) WITH CHECK (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "stock_reservations_tenant" ON public."stock_reservations";
CREATE POLICY "stock_reservations_tenant" ON public."stock_reservations" AS PERMISSIVE FOR ALL TO authenticated USING (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid))) WITH CHECK (is_tenant_member(tenant_id, ( SELECT auth.uid() AS uid)));
DROP POLICY IF EXISTS "vendor_invoice_tax_postings_read" ON public."vendor_invoice_tax_postings";
CREATE POLICY "vendor_invoice_tax_postings_read" ON public."vendor_invoice_tax_postings" AS PERMISSIVE FOR SELECT TO authenticated USING ((is_tenant_member(tenant_id, auth.uid()) AND (COALESCE(private.has_module_access(tenant_id, 'finance'::text, 'view'::text), false) OR COALESCE(private.has_module_access(tenant_id, 'procurement'::text, 'view'::text), false))));
DROP POLICY IF EXISTS "webhook_dispatches_read" ON public."webhook_dispatches";
CREATE POLICY "webhook_dispatches_read" ON public."webhook_dispatches" AS PERMISSIVE FOR SELECT TO authenticated USING (COALESCE(private.has_module_access(tenant_id, 'api'::text, 'view'::text), false));
DROP POLICY IF EXISTS "webhook_endpoints_read" ON public."webhook_endpoints";
CREATE POLICY "webhook_endpoints_read" ON public."webhook_endpoints" AS PERMISSIVE FOR SELECT TO authenticated USING (COALESCE(private.has_module_access(tenant_id, 'api'::text, 'view'::text), false));
DROP POLICY IF EXISTS "webhook_receipts_read" ON public."webhook_receipts";
CREATE POLICY "webhook_receipts_read" ON public."webhook_receipts" AS PERMISSIVE FOR SELECT TO authenticated USING (COALESCE(private.has_module_access(tenant_id, 'api'::text, 'view'::text), false));

-- 9. Policies the repo replaced (kept only in production).
DROP POLICY IF EXISTS "crm_customer_tags_write" ON public."crm_customer_tags";
DROP POLICY IF EXISTS "crm_tags_write" ON public."crm_tags";
DROP POLICY IF EXISTS "grnl_tenant_all" ON public."goods_receipt_lines";

NOTIFY pgrst, 'reload schema';
