-- Allow host payment updates before and after Cosmo games. Safe to rerun.
begin;
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
commit;
