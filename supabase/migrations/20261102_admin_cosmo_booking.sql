begin;
-- Optional Admin setup is required before this migration.
create or replace function public.admin_set_match_booked(p_token text,p_match uuid,p_booked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if not public.admin_valid(p_token) then raise exception 'Admin session expired. Sign in again';end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 if m.venue <> 'Cosmo' then raise exception 'Booking status is only available for Cosmo';end if;
 if p_booked is null then raise exception 'Choose a booking status';end if;
 update public.matches set booked=p_booked where id=p_match;
 insert into kickoff_private.admin_audit(user_id,action,record_id) values(auth.uid(),'set_booked',p_match);
end $$;
revoke all on function public.admin_set_match_booked(text,uuid,boolean) from public,anon;
grant execute on function public.admin_set_match_booked(text,uuid,boolean) to authenticated;
commit;
