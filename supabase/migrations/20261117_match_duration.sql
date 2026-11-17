-- Manual end-time overrides. Run in the Supabase SQL Editor; safe to rerun.
begin;
alter table public.matches add column if not exists duration_override_minutes integer;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.matches'::regclass and conname='matches_duration_override') then
  alter table public.matches add constraint matches_duration_override check(duration_override_minutes is null or duration_override_minutes between 1 and 1440);
 end if;
end $$;
create or replace function public.validate_match_duration()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.venue='Cosmo' and new.duration_override_minutes is not null
 and extract(epoch from new.match_time)/60+new.duration_override_minutes>(case when extract(dow from new.match_date) in (5,6) then 1500 when extract(dow from new.match_date)=0 then 1320 else 1380 end) then
  raise exception 'Cosmo must finish within the opening hours for this date';
 end if;
 return new;
end $$;
revoke all on function public.validate_match_duration() from public,anon,authenticated;
drop trigger if exists validate_match_duration on public.matches;
create trigger validate_match_duration before insert or update of venue,match_date,match_time,duration_override_minutes on public.matches
for each row execute function public.validate_match_duration();
create or replace function public.set_match_duration(p_match uuid,p_minutes integer)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to edit the end time';end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 if m.owner_id<>auth.uid() then raise exception 'Only the host can edit the end time';end if;
 if m.cancelled then raise exception 'This match is cancelled';end if;
 update public.matches set duration_override_minutes=p_minutes where id=p_match;
end $$;
create or replace function public.admin_set_match_duration(p_token text,p_match uuid,p_minutes integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.admin_valid(p_token) then raise exception 'Admin session expired. Sign in again';end if;
 perform 1 from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 update public.matches set duration_override_minutes=p_minutes where id=p_match;
 insert into kickoff_private.admin_audit(user_id,action,record_id) values(auth.uid(),'set_duration',p_match);
end $$;
revoke all on function public.set_match_duration(uuid,integer),public.admin_set_match_duration(text,uuid,integer) from public,anon;
grant execute on function public.set_match_duration(uuid,integer),public.admin_set_match_duration(text,uuid,integer) to authenticated;
commit;
