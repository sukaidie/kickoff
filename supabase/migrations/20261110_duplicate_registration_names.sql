-- Safe to rerun. Existing names, duplicates, statuses and history are unchanged.
begin;
create or replace function public.registration_name_key(p_name text)
returns text language sql immutable strict set search_path = '' as $$
 select lower(btrim(regexp_replace(normalize(p_name,NFKC),'[[:space:]]+',' ','g')));
$$;
-- Non-unique: existing duplicate records are retained rather than deleted/renamed.
create index if not exists players_registration_name on public.players(match_id,public.registration_name_key(name));
create or replace function public.prevent_duplicate_registration_name()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='UPDATE' then
  if new.match_id=old.match_id and public.registration_name_key(new.name)=public.registration_name_key(old.name) then
   return new;
  end if;
 end if;
 -- Serialize with every supported join, add and edit path (including Admin).
 perform 1 from public.matches where id=new.match_id for update;
 if exists(select 1 from public.players p where p.match_id=new.match_id
  and p.id<>new.id and public.registration_name_key(p.name)=public.registration_name_key(new.name)) then
  raise exception 'This name is already registered.' using errcode='23505';
 end if;
 return new;
end $$;
revoke all on function public.prevent_duplicate_registration_name() from public,anon,authenticated;
drop trigger if exists prevent_duplicate_registration_name on public.players;
create trigger prevent_duplicate_registration_name before insert or update of name,match_id on public.players
for each row execute function public.prevent_duplicate_registration_name();
commit;
