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
alter publication supabase_realtime add table public.matches, public.players;
commit;
