-- New registrations default to confirmed. Preserve existing/manual statuses.
begin;
alter table public.players alter column confirmed set default true;
commit;
