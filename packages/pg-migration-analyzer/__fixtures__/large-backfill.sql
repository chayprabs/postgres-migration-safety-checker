UPDATE public.events
SET archived_at = now();

DELETE FROM public.sessions_archive;

INSERT INTO public.user_snapshots (user_id, email)
SELECT id, email
FROM public.users;
