-- Requires the booking migration. Transactional and safe to rerun.
begin;
alter table public.players add column if not exists payment_due boolean not null default true;
-- Historical records and existing Paid entries are preserved.
update public.players p set payment_due=false
from public.matches m where m.id=p.match_id and m.venue='Cosmo'
and not m.booked and not m.cancelled and m.starts_at>now() and not p.paid;

-- All registration paths (self, guest, host, Admin) use the current booking state.
-- Lock the match to serialize registration with booking changes.
create or replace function public.sync_player_payment_due()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 select * into m from public.matches where id=new.match_id for update;
 if not found then raise exception 'Match not found';end if;
 new.payment_due := new.paid or m.venue <> 'Cosmo' or m.booked;
 return new;
end $$;
revoke all on function public.sync_player_payment_due() from public,anon,authenticated;
drop trigger if exists player_payment_due on public.players;
create trigger player_payment_due before insert or update of paid,match_id on public.players
for each row execute function public.sync_player_payment_due();

-- Both host and Admin booking RPCs update matches, so neither can bypass this.
create or replace function public.sync_booking_payment_due()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.booked is distinct from old.booked or new.venue is distinct from old.venue then
  update public.players set payment_due=(paid or new.venue <> 'Cosmo' or new.booked)
  where match_id=new.id and payment_due is distinct from (paid or new.venue <> 'Cosmo' or new.booked);
 end if;
 return new;
end $$;
revoke all on function public.sync_booking_payment_due() from public,anon,authenticated;
drop trigger if exists booking_payment_due on public.matches;
create trigger booking_payment_due after update of booked,venue on public.matches
for each row execute function public.sync_booking_payment_due();
commit;
