-- Requires Admin setup. Run in Supabase SQL Editor; safe to rerun.
begin;
create or replace function public.admin_transfer_host(p_token text,p_match uuid,p_player uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
 if not public.admin_valid(p_token) then raise exception 'Admin session expired. Sign in again';end if;
 perform 1 from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 select user_id into target_user from public.players where id=p_player and match_id=p_match;
 if not found then raise exception 'Player not found in this match';end if;
 if target_user is null then raise exception 'Choose a player who joined using their own browser. Added names do not have a login identity';end if;
 update public.matches set owner_id=target_user where id=p_match;
 insert into kickoff_private.admin_audit(user_id,action,record_id) values(auth.uid(),'transfer_host',p_match);
 return target_user;
end $$;
revoke all on function public.admin_transfer_host(text,uuid,uuid) from public,anon;
grant execute on function public.admin_transfer_host(text,uuid,uuid) to authenticated;
commit;
