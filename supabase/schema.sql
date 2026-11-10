-- Run once in the Supabase SQL editor. Enable Anonymous Sign-Ins in Authentication.
begin;
create table public.matches (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 title text not null check(length(trim(title)) between 1 and 80),
 venue text not null check(venue in ('Cosmo','Merkur Spiel-Arena')),
 match_date date not null,
 match_time time not null,
 starts_at timestamptz generated always as ((match_date + match_time) at time zone 'Europe/Berlin') stored,
 cancelled boolean not null default false,
 created_at timestamptz not null default now(),
 check(venue <> 'Cosmo' or (match_time >= '10:00' and match_time <= '20:00'))
);
create table public.players (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 50),
 created_at timestamptz not null default now(),
 unique(match_id,user_id)
);
create index on public.players(match_id);
alter table public.matches enable row level security;
alter table public.players enable row level security;
-- Public squad data is readable only after anonymous authentication.
create policy "Read match schedule" on public.matches for select to authenticated using(true);
create policy "Read player list" on public.players for select to authenticated using(true);
revoke all on public.matches, public.players from anon, authenticated;
grant select on public.matches, public.players to authenticated;
create policy "Organisers delete own matches" on public.matches for delete to authenticated using (owner_id = (select auth.uid()));
grant delete on public.matches to authenticated;
-- Other writes only through narrowly scoped functions. No arbitrary table updates.
create function public.create_match(p_title text,p_venue text,p_date date,p_time time,p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to create a match'; end if;
 if ((p_date+p_time) at time zone 'Europe/Berlin') <= now() then raise exception 'Choose a future kick-off'; end if;
 if p_time <> date_trunc('minute',p_time::interval)::time then raise exception 'Use whole minutes'; end if;
 if (select count(*) from public.matches where owner_id=auth.uid() and created_at>now()-interval '1 day') >= 20 then raise exception 'Daily match limit reached'; end if;
 insert into public.matches(title,venue,match_date,match_time,owner_id) values(trim(p_title),p_venue,p_date,p_time,auth.uid()) returning id into mid;
 insert into public.players(match_id,user_id,name) values(mid,auth.uid(),trim(p_name));
 return mid;
end $$;
create function public.join_match(p_match uuid,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to join'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 insert into public.players(match_id,user_id,name) values(p_match,auth.uid(),trim(p_name));
end $$;
create function public.leave_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to leave'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found or m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 delete from public.players where match_id=p_match and user_id=auth.uid();
end $$;
create function public.cancel_match(p_match uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to cancel'; end if;
 update public.matches set cancelled=true where id=p_match and owner_id=auth.uid() and not cancelled and starts_at>now();
 if not found then raise exception 'Only the organiser can cancel an upcoming match'; end if;
end $$;
revoke all on function public.create_match(text,text,date,time,text), public.join_match(uuid,text),public.leave_match(uuid),public.cancel_match(uuid) from public,anon;
grant execute on function public.create_match(text,text,date,time,text), public.join_match(uuid,text),public.leave_match(uuid),public.cancel_match(uuid) to authenticated;
-- Host management
-- Host-added guests have no browser identity and cannot impersonate a user.
alter table public.players alter column user_id drop not null;
create or replace function public.host_add_player(p_match uuid,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=p_match for update;
 if auth.uid() is null or not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can manage this match'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 insert into public.players(match_id,user_id,name) values(p_match,null,trim(p_name));
end $$;
create or replace function public.host_remove_player(p_match uuid,p_player uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=p_match for update;
 if auth.uid() is null or not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can manage this match'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 delete from public.players where id=p_player and match_id=p_match;
 if not found then raise exception 'Player not found in this match'; end if;
end $$;
create or replace function public.host_edit_player(p_match uuid,p_player uuid,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=p_match for update;
 if auth.uid() is null or not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can manage this match'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 update public.players set name=trim(p_name) where id=p_player and match_id=p_match;
 if not found then raise exception 'Player not found in this match'; end if;
end $$;
create or replace function public.host_edit_match(p_match uuid,p_title text,p_venue text,p_date date,p_time time)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=p_match for update;
 if auth.uid() is null or not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can manage this match'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 if ((p_date+p_time) at time zone 'Europe/Berlin')<=now() then raise exception 'Choose a future kick-off'; end if;
 if p_time<>date_trunc('minute',p_time::interval)::time then raise exception 'Use whole minutes'; end if;
 update public.matches set title=trim(p_title),venue=p_venue,match_date=p_date,match_time=p_time where id=p_match;
end $$;
revoke all on function public.host_add_player(uuid,text),public.host_remove_player(uuid,uuid),public.host_edit_player(uuid,uuid,text),public.host_edit_match(uuid,text,text,date,time) from public,anon;
grant execute on function public.host_add_player(uuid,text),public.host_remove_player(uuid,uuid),public.host_edit_player(uuid,uuid,text),public.host_edit_match(uuid,text,text,date,time) to authenticated;
-- Multiple-player registration ownership
alter table public.players add column if not exists added_by uuid references auth.users(id);
alter table public.players alter column user_id drop not null;
-- Preserve ownership of existing self-joined and host-added entries.
update public.players p set added_by=coalesce(p.user_id,m.owner_id)
from public.matches m where p.match_id=m.id and p.added_by is null;
alter table public.players alter column added_by set not null;
alter table public.players alter column added_by set default auth.uid();
create or replace function public.add_player(p_match uuid,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to add a player'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 insert into public.players(match_id,user_id,added_by,name) values(p_match,null,auth.uid(),trim(p_name));
end $$;
create or replace function public.edit_player(p_match uuid,p_player uuid,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to edit a player'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 update public.players set name=trim(p_name) where id=p_player and match_id=p_match
 and (m.owner_id=auth.uid() or user_id=auth.uid() or added_by=auth.uid());
 if not found then raise exception 'You can only manage your own players; the host can manage all players'; end if;
end $$;
create or replace function public.remove_player(p_match uuid,p_player uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to remove a player'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found'; end if;
 if m.cancelled or m.starts_at<=now() then raise exception 'This match is closed'; end if;
 delete from public.players where id=p_player and match_id=p_match
 and (m.owner_id=auth.uid() or user_id=auth.uid() or added_by=auth.uid());
 if not found then raise exception 'You can only manage your own players; the host can manage all players'; end if;
end $$;
revoke all on function public.add_player(uuid,text),public.edit_player(uuid,uuid,text),public.remove_player(uuid,uuid) from public,anon;
grant execute on function public.add_player(uuid,text),public.edit_player(uuid,uuid,text),public.remove_player(uuid,uuid) to authenticated;
-- Completed Cosmo payment tracking
alter table public.players add column if not exists paid boolean not null default false;
alter table public.players add column if not exists payment_updated_at timestamptz;
alter table public.players add column if not exists payment_updated_by uuid references auth.users(id);
create or replace function public.set_player_paid(p_match uuid,p_player uuid,p_paid boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; minutes integer;
begin
 if auth.uid() is null then raise exception 'Sign in to manage payments'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can update payment status'; end if;
 if m.venue<>'Cosmo' or m.cancelled then raise exception 'Payment tracking is only available for completed Cosmo matches'; end if;
 select case when count(*)>=15 then 120 else 90 end into minutes from public.players where match_id=p_match;
 if m.starts_at + minutes * interval '1 minute'>now() then raise exception 'Payment tracking is available after the match ends'; end if;
 if p_paid is null then raise exception 'Choose paid or unpaid'; end if;
 update public.players set paid=p_paid,payment_updated_at=now(),payment_updated_by=auth.uid()
 where id=p_player and match_id=p_match;
 if not found then raise exception 'Player not found in this match'; end if;
end $$;
-- Optional, explicitly invoked demo: one completed fixture per current identity.
-- No other user's match or identity is changed. Repeated calls retain edits.
create or replace function public.create_payment_demo()
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid; inserted_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to create the test match'; end if;
 mid := pg_catalog.md5(auth.uid()::text || ':kickoff-payment-demo-v1')::uuid;
 insert into public.matches(id,owner_id,title,venue,match_date,match_time)
 values(mid,auth.uid(),'TEST · Cosmo payment status','Cosmo',(now() at time zone 'Europe/Berlin')::date-1,'18:00')
 on conflict(id) do nothing returning id into inserted_id;
 if inserted_id is not null then
  insert into public.players(match_id,user_id,added_by,name,paid,payment_updated_at,payment_updated_by)
  values(mid,auth.uid(),auth.uid(),'Demo Host',false,null,null),
        (mid,null,auth.uid(),'Demo Player 1',true,now(),auth.uid()),
        (mid,null,auth.uid(),'Demo Player 2',false,null,null);
 end if;
 return mid;
end $$;
revoke all on function public.set_player_paid(uuid,uuid,boolean),public.create_payment_demo() from public,anon;
grant execute on function public.set_player_paid(uuid,uuid,boolean),public.create_payment_demo() to authenticated;
-- Pre-match payment tracking
create or replace function public.set_player_paid(p_match uuid,p_player uuid,p_paid boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to manage payments'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can update payment status'; end if;
 if m.venue<>'Cosmo' or m.cancelled then raise exception 'Payment tracking is only available for non-cancelled Cosmo matches'; end if;
 if p_paid is null then raise exception 'Choose paid or unpaid'; end if;
 update public.players set paid=p_paid,payment_updated_at=now(),payment_updated_by=auth.uid()
 where id=p_player and match_id=p_match;
 if not found then raise exception 'Player not found in this match'; end if;
end $$;
revoke all on function public.set_player_paid(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_player_paid(uuid,uuid,boolean) to authenticated;
-- Merkur confirmation
alter table public.players add column if not exists confirmed boolean not null default false;
alter table public.players add column if not exists confirmation_updated_at timestamptz;
alter table public.players add column if not exists confirmation_updated_by uuid references auth.users(id);
create or replace function public.set_player_confirmed(p_match uuid,p_player uuid,p_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to update confirmation'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found'; end if;
 if m.venue<>'Merkur Spiel-Arena' or m.cancelled then raise exception 'Confirmation is only available for non-cancelled Merkur matches'; end if;
 if p_confirmed is null then raise exception 'Choose confirmed or unconfirmed'; end if;
 update public.players set confirmed=p_confirmed,confirmation_updated_at=now(),confirmation_updated_by=auth.uid()
 where id=p_player and match_id=p_match
 and (m.owner_id=auth.uid() or user_id=auth.uid() or added_by=auth.uid());
 if not found then raise exception 'Only the host or the person who registered this player can change confirmation'; end if;
end $$;
revoke all on function public.set_player_confirmed(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_player_confirmed(uuid,uuid,boolean) to authenticated;
-- New registrations default to confirmed; existing statuses are preserved.
alter table public.players alter column confirmed set default true;
alter publication supabase_realtime add table public.matches, public.players;
-- Manual Cosmo venue booking record; does not reserve a pitch.
alter table public.matches add column if not exists booked boolean not null default false;
create or replace function public.set_match_booked(p_match uuid,p_booked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to update booking status';end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 if m.owner_id <> auth.uid() then raise exception 'Only the organiser can update booking status';end if;
 if m.venue <> 'Cosmo' then raise exception 'Booking status is only available for Cosmo';end if;
 if p_booked is null then raise exception 'Choose a booking status';end if;
 update public.matches set booked=p_booked where id=p_match;
end $$;
revoke all on function public.set_match_booked(uuid,boolean) from public,anon;
grant execute on function public.set_match_booked(uuid,boolean) to authenticated;
-- Booking-aware payment readiness
alter table public.players add column if not exists payment_due boolean not null default true;
-- Historical records and existing Paid entries are preserved.
update public.players p set payment_due=false
from public.matches m where m.id=p.match_id and m.venue='Cosmo'
and not m.booked and not m.cancelled and m.starts_at>now() and not p.paid;

-- All registration paths (self, guest, host, Admin) use the current booking state.
-- Lock the match to serialize registration with booking changes.
create or replace function public.sync_player_payment_due()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=new.match_id for update;
 if not found then raise exception 'Match not found';end if;
 new.payment_due := new.paid or m.venue <> 'Cosmo' or m.booked;
 return new;
end $$;
revoke all on function public.sync_player_payment_due() from public,anon,authenticated;
drop trigger if exists player_payment_due on public.players;
create trigger player_payment_due before insert or update of paid,match_id on public.players
for each row execute function public.sync_player_payment_due();

-- Both host and Admin booking RPCs update matches, so neither can bypass this.
create or replace function public.sync_booking_payment_due()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 -- Only a real Not booked -> Booked transition marks the current host paid.
 -- Match the host's primary browser identity, never guests they registered.
 if new.venue='Cosmo' and new.booked and not old.booked then
  update public.players set paid=true,payment_updated_at=now(),payment_updated_by=auth.uid()
  where match_id=new.id and user_id=new.owner_id and not paid;
 end if;
 if new.booked is distinct from old.booked or new.venue is distinct from old.venue then
  update public.players set payment_due=(paid or new.venue <> 'Cosmo' or new.booked)
  where match_id=new.id and payment_due is distinct from (paid or new.venue <> 'Cosmo' or new.booked);
 end if;
 return new;
end $$;
revoke all on function public.sync_booking_payment_due() from public,anon,authenticated;
drop trigger if exists booking_payment_due on public.matches;
create trigger booking_payment_due after update of booked,venue on public.matches
for each row execute function public.sync_booking_payment_due();
-- Booked Cosmo pitch selection
alter table public.matches add column if not exists pitch_number integer;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.matches'::regclass and conname='matches_valid_pitch') then
  alter table public.matches add constraint matches_valid_pitch check(pitch_number is null or (pitch_number between 1 and 6 and venue='Cosmo' and booked));
 end if;
end $$;
create or replace function public.clear_unbooked_pitch()
returns trigger language plpgsql set search_path = '' as $$
begin
 if not new.booked or new.venue <> 'Cosmo' then new.pitch_number:=null;end if;
 return new;
end $$;
revoke all on function public.clear_unbooked_pitch() from public,anon,authenticated;
drop trigger if exists clear_unbooked_pitch on public.matches;
create trigger clear_unbooked_pitch before update of booked,venue on public.matches
for each row execute function public.clear_unbooked_pitch();
create or replace function public.set_match_pitch(p_match uuid,p_pitch integer)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to select a pitch';end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 if m.owner_id<>auth.uid() then raise exception 'Only the organiser can select a pitch';end if;
 if m.venue<>'Cosmo' or not m.booked then raise exception 'Book a Cosmo match before selecting a pitch';end if;
 if p_pitch is not null and (p_pitch<1 or p_pitch>6) then raise exception 'Choose Soccer 1 to Soccer 6';end if;
 update public.matches set pitch_number=p_pitch where id=p_match;
end $$;
revoke all on function public.set_match_pitch(uuid,integer) from public,anon;
grant execute on function public.set_match_pitch(uuid,integer) to authenticated;
-- Automatic kickoff headcount check (install scheduler separately)
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
-- Prevent new duplicate registration names
create or replace function public.registration_name_key(p_name text)
returns text language sql immutable strict set search_path = '' as $$
 select lower(btrim(regexp_replace(normalize(p_name,NFKC),'[[:space:]]+',' ','g')));
$$;
-- Non-unique: existing duplicate records are retained rather than deleted/renamed.
create index if not exists players_registration_name on public.players(match_id,public.registration_name_key(name));
create or replace function public.prevent_duplicate_registration_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='UPDATE' then
  if new.match_id=old.match_id and public.registration_name_key(new.name)=public.registration_name_key(old.name) then
   return new;
  end if;
 end if;
 -- Serialize with every supported join, add and edit path (including Admin).
 perform 1 from public.matches where id=new.match_id for update;
 if exists(select 1 from public.players p where p.match_id=new.match_id
  and p.id<>new.id and public.registration_name_key(p.name)=public.registration_name_key(new.name)) then
  raise exception 'This name is already registered.' using errcode='23505';
 end if;
 return new;
end $$;
revoke all on function public.prevent_duplicate_registration_name() from public,anon,authenticated;
drop trigger if exists prevent_duplicate_registration_name on public.players;
create trigger prevent_duplicate_registration_name before insert or update of name,match_id on public.players
for each row execute function public.prevent_duplicate_registration_name();
commit;
