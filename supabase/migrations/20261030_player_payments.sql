-- Existing projects: run in the Supabase SQL Editor. Safe to rerun.
begin;
alter table public.players add column if not exists paid boolean not null default false;
alter table public.players add column if not exists payment_updated_at timestamptz;
alter table public.players add column if not exists payment_updated_by uuid references auth.users(id);
create or replace function public.set_player_paid(p_match uuid,p_player uuid,p_paid boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.matches; minutes integer;
begin
 if auth.uid() is null then raise exception 'Sign in to manage payments'; end if;
 select * into m from public.matches where id=p_match for update;
 if not found or m.owner_id<>auth.uid() then raise exception 'Only the organiser can update payment status'; end if;
 if m.venue<>'Cosmo' or m.cancelled then raise exception 'Payment tracking is only available for completed Cosmo matches'; end if;
 select case when count(*)>=15 then 120 else 90 end into minutes from public.players where match_id=p_match;
 if m.starts_at + minutes * interval '1 minute'>now() then raise exception 'Payment tracking is available after the match ends'; end if;
 if p_paid is null then raise exception 'Choose paid or unpaid'; end if;
 update public.players set paid=p_paid,payment_updated_at=now(),payment_updated_by=auth.uid()
 where id=p_player and match_id=p_match;
 if not found then raise exception 'Player not found in this match'; end if;
end $$;
-- Optional, explicitly invoked demo: one completed fixture per current identity.
-- No other user's match or identity is changed. Repeated calls retain edits.
create or replace function public.create_payment_demo()
returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid; inserted_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to create the test match'; end if;
 mid := pg_catalog.md5(auth.uid()::text || ':kickoff-payment-demo-v1')::uuid;
 insert into public.matches(id,owner_id,title,venue,match_date,match_time)
 values(mid,auth.uid(),'TEST · Cosmo payment status','Cosmo',(now() at time zone 'Europe/Berlin')::date-1,'18:00')
 on conflict(id) do nothing returning id into inserted_id;
 if inserted_id is not null then
  insert into public.players(match_id,user_id,added_by,name,paid,payment_updated_at,payment_updated_by)
  values(mid,auth.uid(),auth.uid(),'Demo Host',false,null,null),
        (mid,null,auth.uid(),'Demo Player 1',true,now(),auth.uid()),
        (mid,null,auth.uid(),'Demo Player 2',false,null,null);
 end if;
 return mid;
end $$;
revoke all on function public.set_player_paid(uuid,uuid,boolean),public.create_payment_demo() from public,anon;
grant execute on function public.set_player_paid(uuid,uuid,boolean),public.create_payment_demo() to authenticated;
commit;
