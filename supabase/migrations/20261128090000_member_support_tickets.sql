-- Members can file and work on support tickets.
--
-- The default 'member' role could view the support module but not edit it, so an ordinary employee could
-- not open a support ticket (support_tickets insert needs support edit). Support tickets are how pilot
-- users report problems from inside the system, so members get edit on the support module. This only
-- widens support_tickets (and message_threads, which members already edit through messages); no other
-- table or command checks the support module. Viewers stay read-only.

INSERT INTO public.role_permissions(role, module, can_view, can_edit)
VALUES ('member', 'support', true, true)
ON CONFLICT (role, module) DO UPDATE SET can_view = true, can_edit = true;
