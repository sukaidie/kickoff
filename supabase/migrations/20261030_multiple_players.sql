-- Existing projects: run in the Supabase SQL Editor. Safe to rerun.
begin;
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
commit;
