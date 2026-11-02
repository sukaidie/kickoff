begin;
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
commit;
