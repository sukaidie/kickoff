-- Requires 20261102_payment_due.sql. Safe to rerun; no existing data is updated.
begin;
create or replace function public.sync_booking_payment_due()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 -- Only a real Not booked -> Booked transition marks the current host paid.
 -- Match the host's primary browser identity, never guests they registered.
 if new.venue='Cosmo' and new.booked and not old.booked then
  update public.players set paid=true,payment_updated_at=now(),payment_updated_by=auth.uid()
  where match_id=new.id and user_id=new.owner_id and not paid;
 end if;
 if new.booked is distinct from old.booked or new.venue is distinct from old.venue then
  update public.players set payment_due=(paid or new.venue <> 'Cosmo' or new.booked)
  where match_id=new.id and payment_due is distinct from (paid or new.venue <> 'Cosmo' or new.booked);
 end if;
 return new;
end $$;
revoke all on function public.sync_booking_payment_due() from public,anon,authenticated;
commit;
