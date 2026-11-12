begin;

create or replace function public.host_add_player(p_match uuid,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=p_match for update;
 if auth.uid() is null or not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can manage this match'; end if;
 if m.cancelled then raise exception 'This match is closed'; end if;
 insert into public.players(match_id,user_id,name) values(p_match,null,trim(p_name));
end $$;

create or replace function public.add_player(p_match uuid,p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to add a player'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found'; end if;
 if m.cancelled or (m.starts_at<=now() and m.owner_id<>auth.uid()) then raise exception 'This match is closed'; end if;
 insert into public.players(match_id,user_id,added_by,name) values(p_match,null,auth.uid(),trim(p_name));
end $$;

commit;
