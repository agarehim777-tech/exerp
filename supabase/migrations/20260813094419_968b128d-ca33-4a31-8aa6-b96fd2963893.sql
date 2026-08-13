CREATE TABLE IF NOT EXISTS public.ai_insight_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_key text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  title text,
  action text NOT NULL CHECK (action IN ('accepted','dismissed','done')),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_insight_feedback_tenant_idx ON public.ai_insight_feedback (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insight_feedback TO authenticated;
GRANT ALL ON public.ai_insight_feedback TO service_role;

ALTER TABLE public.ai_insight_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_insight_feedback_tenant_select" ON public.ai_insight_feedback
  FOR SELECT TO authenticated
  USING (private.is_tenant_member(tenant_id, auth.uid()));

CREATE POLICY "ai_insight_feedback_tenant_write" ON public.ai_insight_feedback
  FOR ALL TO authenticated
  USING (private.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (private.is_tenant_member(tenant_id, auth.uid()));

ALTER TABLE public.notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_channel_check
  CHECK (channel = ANY (ARRAY['in_app','email','sms','push','whatsapp','telegram']));

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS telegram_chat_id text;

CREATE INDEX IF NOT EXISTS employee_events_tenant_date_idx
  ON public.employee_events (tenant_id, event_type, start_date DESC);