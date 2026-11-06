-- Safe to rerun. No historical matches are enrolled.
begin;
alter table public.matches add column if not exists kickoff_check_pending boolean not null default false;
alter table public.matches add column if not exists kickoff_checked_at timestamptz;
alter table public.matches add column if not exists kickoff_player_count integer;
alter table public.matches add column if not exists auto_cancelled_for_players boolean not null default false;
-- Activate only upcoming matches; never sweep historical records on installation.
update public.matches set kickoff_check_pending=true
where not cancelled and starts_at>now() and kickoff_checked_at is null;

create or replace function public.prepare_kickoff_check()
returns trigger language plpgsql set search_path = '' as $$
declare kickoff timestamptz := (new.match_date+new.match_time) at time zone 'Europe/Berlin';
begin
 if tg_op='INSERT' then
  new.kickoff_check_pending:=not new.cancelled and kickoff>now();
 elsif new.match_date is distinct from old.match_date or new.match_time is distinct from old.match_time
    or (old.cancelled and not new.cancelled) then
  new.kickoff_check_pending:=not new.cancelled and kickoff>now();
  new.kickoff_checked_at:=null;new.kickoff_player_count:=null;new.auto_cancelled_for_players:=false;
 elsif new.cancelled then
  new.kickoff_check_pending:=false;
 end if;
 return new;
end $$;
revoke all on function public.prepare_kickoff_check() from public,anon,authenticated;
drop trigger if exists prepare_kickoff_check on public.matches;
create trigger prepare_kickoff_check before insert or update of match_date,match_time,cancelled on public.matches
for each row execute function public.prepare_kickoff_check();

-- Owner-only worker: browsers cannot sweep/cancel arbitrary matches.
-- Existing registration functions lock the same match row, serializing this check.
create or replace function public.cancel_underfilled_matches()
returns integer language plpgsql security definer set search_path = '' as $$
declare m record;player_count integer;cancelled_count integer:=0;
begin
 for m in select id from public.matches
  where kickoff_check_pending and not cancelled and starts_at<=now()
  order by starts_at,id for update skip locked
 loop
  select count(*) into player_count from public.players where match_id=m.id;
  update public.matches set cancelled=(player_count<10),
   auto_cancelled_for_players=(player_count<10),kickoff_player_count=player_count,
   kickoff_checked_at=now(),kickoff_check_pending=false where id=m.id;
  if player_count<10 then cancelled_count:=cancelled_count+1;end if;
 end loop;
 return cancelled_count;
end $$;
revoke all on function public.cancel_underfilled_matches() from public,anon,authenticated;
create index if not exists matches_pending_kickoff on public.matches(starts_at) where kickoff_check_pending and not cancelled;
commit;
