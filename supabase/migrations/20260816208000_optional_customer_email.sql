-- Blank strings are values and therefore collide in the partial unique email
-- index. Optional customer e-mails must be represented by NULL.
UPDATE public.customers
   SET email = NULL
 WHERE email IS NOT NULL
   AND btrim(email) = '';
