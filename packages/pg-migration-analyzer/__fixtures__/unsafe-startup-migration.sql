ALTER TABLE public.users
  ADD COLUMN status text NOT NULL DEFAULT 'active';

CREATE INDEX users_last_seen_at_idx
  ON public.users (last_seen_at);

ALTER TABLE public.orders
  ADD CONSTRAINT orders_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id);
