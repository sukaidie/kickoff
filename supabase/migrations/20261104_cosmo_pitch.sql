-- Apply after the Cosmo booking migration. Safe to rerun.
begin;
alter table public.matches add column if not exists pitch_number integer;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.matches'::regclass and conname='matches_valid_pitch') then
  alter table public.matches add constraint matches_valid_pitch check(pitch_number is null or (pitch_number between 1 and 6 and venue='Cosmo' and booked));
 end if;
end $$;
create or replace function public.clear_unbooked_pitch()
returns trigger language plpgsql set search_path = '' as $$
begin
 if not new.booked or new.venue <> 'Cosmo' then new.pitch_number:=null;end if;
 return new;
end $$;
revoke all on function public.clear_unbooked_pitch() from public,anon,authenticated;
drop trigger if exists clear_unbooked_pitch on public.matches;
create trigger clear_unbooked_pitch before update of booked,venue on public.matches
for each row execute function public.clear_unbooked_pitch();
create or replace function public.set_match_pitch(p_match uuid,p_pitch integer)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches;
begin
 if auth.uid() is null then raise exception 'Sign in to select a pitch';end if;
 select * into m from public.matches where id=p_match for update;
 if not found then raise exception 'Match not found';end if;
 if m.owner_id<>auth.uid() then raise exception 'Only the organiser can select a pitch';end if;
 if m.venue<>'Cosmo' or not m.booked then raise exception 'Book a Cosmo match before selecting a pitch';end if;
 if p_pitch is not null and (p_pitch<1 or p_pitch>6) then raise exception 'Choose Soccer 1 to Soccer 6';end if;
 update public.matches set pitch_number=p_pitch where id=p_match;
end $$;
revoke all on function public.set_match_pitch(uuid,integer) from public,anon;
grant execute on function public.set_match_pitch(uuid,integer) to authenticated;
commit;
