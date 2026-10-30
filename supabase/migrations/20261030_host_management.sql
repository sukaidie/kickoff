-- Run once (safe to rerun) in the SQL Editor for existing Supabase projects.
begin;
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
commit;
