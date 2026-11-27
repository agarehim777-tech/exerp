-- Messages and support comments are never lost when two people write in the same thread at the same time.
--
-- A conversation (message_threads) keeps its messages in metadata.messages and a support ticket
-- (support_tickets) its comments in metadata.comments. The collection sync upserts the whole row, so when
-- two browsers each appended a message to the same thread, the later save replaced the earlier one.
-- The app only appends to these lists (it never removes a message or a comment), so an update now merges
-- them by id: every stored entry stays in its order (taking the incoming version when the same id is sent
-- again, e.g. a read flag), and entries the incoming row adds are appended after them.

CREATE OR REPLACE FUNCTION private.merge_appended_entries(_stored jsonb, _incoming jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH stored AS (
    SELECT value, ordinality AS ord,
      coalesce(value->>'id', value->>'commentId', md5(value::text)) AS entry_key
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_stored) = 'array' THEN _stored ELSE '[]'::jsonb END)
      WITH ORDINALITY
  ), incoming AS (
    SELECT value, ordinality AS ord,
      coalesce(value->>'id', value->>'commentId', md5(value::text)) AS entry_key
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_incoming) = 'array' THEN _incoming ELSE '[]'::jsonb END)
      WITH ORDINALITY
  ), merged AS (
    SELECT 0 AS part, s.ord, coalesce(i.value, s.value) AS value
    FROM stored s
    LEFT JOIN LATERAL (SELECT value FROM incoming WHERE incoming.entry_key = s.entry_key ORDER BY ord DESC LIMIT 1) i ON true
    UNION ALL
    SELECT 1 AS part, i.ord, i.value
    FROM incoming i
    WHERE NOT EXISTS (SELECT 1 FROM stored s WHERE s.entry_key = i.entry_key)
  )
  SELECT coalesce(jsonb_agg(value ORDER BY part, ord), '[]'::jsonb) FROM merged
$$;

CREATE OR REPLACE FUNCTION private.merge_thread_entries_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_key text := TG_ARGV[0];
BEGIN
  IF jsonb_typeof(OLD.metadata -> v_key) = 'array' AND jsonb_typeof(NEW.metadata -> v_key) = 'array' THEN
    NEW.metadata := jsonb_set(NEW.metadata, ARRAY[v_key],
      private.merge_appended_entries(OLD.metadata -> v_key, NEW.metadata -> v_key));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_threads_merge_messages ON public.message_threads;
CREATE TRIGGER message_threads_merge_messages BEFORE UPDATE ON public.message_threads
  FOR EACH ROW EXECUTE FUNCTION private.merge_thread_entries_on_update('messages');

DROP TRIGGER IF EXISTS support_tickets_merge_comments ON public.support_tickets;
CREATE TRIGGER support_tickets_merge_comments BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION private.merge_thread_entries_on_update('comments');

REVOKE ALL ON FUNCTION private.merge_appended_entries(jsonb, jsonb) FROM PUBLIC, anon;
