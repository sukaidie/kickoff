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
alter publication supabase_realtime add table public.matches, public.players;
commit;
