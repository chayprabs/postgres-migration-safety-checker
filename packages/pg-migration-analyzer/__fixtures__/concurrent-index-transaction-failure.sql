BEGIN;

CREATE INDEX CONCURRENTLY users_lower_email_idx
  ON public.users ((lower(email)));

COMMIT;
