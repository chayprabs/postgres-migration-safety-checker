SET lock_timeout = '5s';
SET statement_timeout = '15min';

ALTER TABLE public.users
  ADD COLUMN status text;

-- Backfill status in batches outside the migration before enforcing the invariant.
ALTER TABLE public.users
  ADD CONSTRAINT users_status_present CHECK (status IS NOT NULL) NOT VALID;

ALTER TABLE public.users
  VALIDATE CONSTRAINT users_status_present;

ALTER TABLE public.users
  ALTER COLUMN status SET NOT NULL;
