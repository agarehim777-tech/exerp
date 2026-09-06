CREATE TABLE IF NOT EXISTS public.ai_insight_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  insight_key text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  title text,
  action text NOT NULL CHECK (action IN ('accepted', 'dismissed', 'done')),
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_insight_feedback_tenant_idx
  ON public.ai_insight_feedback (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_insight_feedback TO authenticated;
GRANT ALL ON public.ai_insight_feedback TO service_role;

ALTER TABLE public.ai_insight_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insight_feedback_tenant_select ON public.ai_insight_feedback;
CREATE POLICY ai_insight_feedback_tenant_select
  ON public.ai_insight_feedback
  FOR SELECT
  TO authenticated
  USING (private.is_tenant_member(tenant_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS ai_insight_feedback_tenant_write ON public.ai_insight_feedback;
CREATE POLICY ai_insight_feedback_tenant_write
  ON public.ai_insight_feedback
  FOR ALL
  TO authenticated
  USING (private.is_tenant_member(tenant_id, (SELECT auth.uid())))
  WITH CHECK (
    private.is_tenant_member(tenant_id, (SELECT auth.uid()))
    AND created_by = (SELECT auth.uid())
  );
