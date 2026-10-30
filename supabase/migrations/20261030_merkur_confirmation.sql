-- Merkur attendance confirmation. Safe to rerun in the SQL Editor.
begin;
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
commit;
